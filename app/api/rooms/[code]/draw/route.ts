import { normalizeCode } from "@/lib/codes";
import { GameError, type StrokeOp } from "@/lib/game/types";
import { appendStrokes, assertIdentity, errorResponse, identityFromRequest, loadRoom, readJson } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const MAX_OPS = 200;
const MAX_POINTS = 2000;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function sanitizeOps(raw: unknown): StrokeOp[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPS) throw new GameError("Invalid ops");
  const out: StrokeOp[] = [];
  for (const op of raw as Record<string, unknown>[]) {
    if (!op || typeof op !== "object") throw new GameError("Invalid op");
    if (op.t === "clear") out.push({ t: "clear" });
    else if (op.t === "undo") {
      if (typeof op.id !== "string" || op.id.length > 32) throw new GameError("Invalid undo");
      out.push({ t: "undo", id: op.id });
    } else if (op.t === "seg") {
      const { id, color, size, pts } = op;
      if (typeof id !== "string" || id.length > 32) throw new GameError("Invalid seg id");
      if (typeof color !== "string" || !COLOR_RE.test(color)) throw new GameError("Invalid color");
      const s = Number(size);
      if (!Number.isFinite(s) || s < 1 || s > 80) throw new GameError("Invalid size");
      if (!Array.isArray(pts) || pts.length < 2 || pts.length % 2 !== 0 || pts.length > MAX_POINTS) throw new GameError("Invalid points");
      const clean = (pts as unknown[]).map((n) => {
        const v = Number(n);
        if (!Number.isFinite(v)) throw new GameError("Invalid point");
        return Math.round(v * 10) / 10;
      });
      out.push({ t: "seg", id, color: color.toLowerCase(), size: s, pts: clean });
    } else throw new GameError("Invalid op type");
  }
  return out;
}

/** POST /api/rooms/:code/draw — Body: { turnId, ops: StrokeOp[] } */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizeCode((await ctx.params).code);
    if (!code) throw new GameError("Invalid room code", 404);
    const body = await readJson<{ turnId?: string; ops?: unknown }>(req);
    const ops = sanitizeOps(body.ops);

    const state = await loadRoom(code);
    if (!state) throw new GameError("Room not found", 404);
    const playerId = assertIdentity(state, identityFromRequest(req));
    if (state.phase !== "drawing" || !state.turn) throw new GameError("Nobody is drawing right now", 409);
    if (state.turn.drawerId !== playerId) throw new GameError("You are not the drawer", 403);
    if (body.turnId !== state.turn.id) throw new GameError("Stale turn", 409);

    await appendStrokes(code, { turnId: state.turn.id, from: playerId, ops });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
