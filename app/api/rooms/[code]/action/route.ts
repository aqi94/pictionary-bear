import { normalizeCode } from "@/lib/codes";
import { redactForViewer } from "@/lib/game/redact";
import { GameError, type Action } from "@/lib/game/types";
import { applyAction, assertIdentity, errorResponse, identityFromRequest, loadRoom, readJson } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const CLIENT_ACTIONS = new Set<Action["type"]>(["leave", "kick", "update_settings", "start", "choose_word", "guess", "tick", "play_again"]);

/** POST /api/rooms/:code/action — Body: Action. Headers: x-player-id, x-player-token */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizeCode((await ctx.params).code);
    if (!code) throw new GameError("Invalid room code", 404);
    const action = await readJson<Action>(req);
    if (!action || typeof action.type !== "string" || !CLIENT_ACTIONS.has(action.type)) throw new GameError("Unknown action");

    const identity = identityFromRequest(req);
    const current = await loadRoom(code);
    if (!current) throw new GameError("Room not found", 404);
    const playerId = assertIdentity(current, identity);

    const now = Date.now();
    const state = await applyAction(code, playerId, action, now);
    return Response.json({ ok: true, room: redactForViewer(state, playerId, now) });
  } catch (e) {
    return errorResponse(e);
  }
}
