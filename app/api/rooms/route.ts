import { randomCode, randomId, randomToken } from "@/lib/codes";
import { createRoom, sanitizeAvatar, sanitizeName } from "@/lib/game/engine";
import { GameError } from "@/lib/game/types";
import { errorResponse, readJson, roomExists, withRoomLock } from "@/lib/rooms";

export const dynamic = "force-dynamic";

/** POST /api/rooms — create a room. Body: { name, avatar } */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ name?: string; avatar?: number }>(req);
    const name = sanitizeName(body.name);
    const avatar = sanitizeAvatar(body.avatar);
    const playerId = randomId();
    const token = randomToken();

    let code = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomCode();
      if (!(await roomExists(candidate))) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new GameError("Could not allocate a room code, try again", 503);

    await withRoomLock(code, (current) => {
      if (current) throw new GameError("Room code collision, try again", 503);
      return { state: createRoom(code, { id: playerId, name, avatar, token }, Date.now()), result: null };
    });

    return Response.json({ code, playerId, token, name });
  } catch (e) {
    return errorResponse(e);
  }
}
