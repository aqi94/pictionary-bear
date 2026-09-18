import { normalizeCode, randomId } from "@/lib/codes";
import { redactForViewer } from "@/lib/game/redact";
import { GameError, type BusMessage, type RoomState, type ServerEvent } from "@/lib/game/types";
import { getStore } from "@/lib/redis";
import { applyAction, assertIdentity, channel, errorResponse, identityFromRequest, loadRoom, loadStrokes } from "@/lib/rooms";

export const dynamic = "force-dynamic";
// Vercel Hobby caps function duration at 300s; we close a bit earlier so the client reconnects cleanly.
export const maxDuration = 300;
const STREAM_LIFETIME_MS = 285_000;
const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

/** GET /api/rooms/:code/events?playerId=..&token=.. — Server-Sent Events stream */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  let code: string | null = null;
  let playerId: string;
  try {
    code = normalizeCode((await ctx.params).code);
    if (!code) throw new GameError("Invalid room code", 404);
    const state = await loadRoom(code);
    if (!state) throw new GameError("Room not found", 404);
    playerId = assertIdentity(state, identityFromRequest(req));
  } catch (e) {
    return errorResponse(e);
  }

  const roomCode = code;
  const connId = randomId(6);
  const store = getStore();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let lifetime: ReturnType<typeof setTimeout> | null = null;
  let lastState: RoomState | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ServerEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const comment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        if (lifetime) clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        // Mark disconnected (only if this is still the player's latest connection).
        applyAction(roomCode, playerId, { type: "disconnect", connId }).catch(() => {});
      };

      req.signal.addEventListener("abort", cleanup);

      // Subscribe BEFORE taking the snapshot so nothing is missed in between.
      unsubscribe = await store.subscribe(channel(roomCode), (raw) => {
        let msg: BusMessage;
        try {
          msg = JSON.parse(raw) as BusMessage;
        } catch {
          return;
        }
        if (msg.type === "state") {
          if (lastState && msg.state.version < lastState.version) return; // out-of-order
          lastState = msg.state;
          if (!msg.state.players.some((p) => p.id === playerId)) {
            send({ type: "kicked" });
            cleanup();
            return;
          }
          send({ type: "state", room: redactForViewer(msg.state, playerId, Date.now()) });
        } else if (msg.type === "stroke") {
          if (msg.batch.from === playerId) return; // drawer already has its own strokes
          send({ type: "stroke", batch: msg.batch });
        }
      });

      try {
        // Mark connected; this also broadcasts a fresh state to everyone (including us).
        const state = await applyAction(roomCode, playerId, { type: "connect", connId });
        lastState = state;
        const turnId = state.turn?.id ?? null;
        const strokes = turnId && state.phase !== "choosing" ? await loadStrokes(roomCode, turnId) : [];
        send({ type: "snapshot", room: redactForViewer(state, playerId, Date.now()), strokes, turnId });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Failed to join" });
        cleanup();
        return;
      }

      heartbeat = setInterval(() => comment("hb"), HEARTBEAT_MS);
      lifetime = setTimeout(() => {
        comment("reconnect");
        cleanup();
      }, STREAM_LIFETIME_MS);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (lifetime) clearTimeout(lifetime);
      applyAction(roomCode, playerId, { type: "disconnect", connId }).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
