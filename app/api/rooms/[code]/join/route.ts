import { normalizeCode, randomId, randomToken } from "@/lib/codes";
import { addPlayer, sanitizeAvatar, sanitizeName } from "@/lib/game/engine";
import { GameError } from "@/lib/game/types";
import { errorResponse, identityFromRequest, loadRoom, readJson, withRoomLock } from "@/lib/rooms";

export const dynamic = "force-dynamic";

/** POST /api/rooms/:code/join — Body: { name, avatar, playerId?, token? } */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizeCode((await ctx.params).code);
    if (!code) throw new GameError("Invalid room code", 404);
    const body = await readJson<{ name?: string; avatar?: number; playerId?: string; token?: string }>(req);
    const name = sanitizeName(body.name);
    const avatar = sanitizeAvatar(body.avatar);

    const result = await withRoomLock(code, (current) => {
      if (!current) throw new GameError("Room not found", 404);
      // Returning player with valid credentials: just let them back in.
      if (body.playerId && body.token && current.secrets[body.playerId] === body.token) {
        const p = current.players.find((x) => x.id === body.playerId)!;
        return { state: null, result: { code, playerId: p.id, token: body.token, name: p.name } };
      }
      const playerId = randomId();
      const token = randomToken();
      const state = addPlayer(current, { id: playerId, name, avatar, token }, Date.now());
      const joined = state.players.find((p) => p.id === playerId)!;
      return { state, result: { code, playerId, token, name: joined.name } };
    });

    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/rooms/:code/join — lightweight existence check for the join form. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizeCode((await ctx.params).code);
    if (!code) throw new GameError("Invalid room code", 404);
    const state = await loadRoom(code);
    if (!state) throw new GameError("Room not found", 404);
    const id = identityFromRequest(req);
    const valid = id ? state.secrets[id.playerId] === id.token : undefined;
    return Response.json({
      code,
      players: state.players.length,
      maxPlayers: state.settings.maxPlayers,
      phase: state.phase,
      valid,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
