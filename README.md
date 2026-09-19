# 🐻 Pictionary Bear

A cozy multiplayer Pictionary game for the browser. Create a room, share the 4-letter code, and take turns drawing while everyone else guesses in the chat.

Built with Next.js (App Router), Tailwind CSS, Redis (Upstash via the Vercel Marketplace), and deployed on Vercel's free Hobby plan.

## How to play

1. Enter a name, pick a bear, and **Create a room** (or **Join** with a friend's code).
2. The host picks the number of rounds, draw time, and word difficulty, then starts the game once at least two bears are connected.
3. Each round every player draws once. The artist picks one of three words and draws it on the canvas.
4. Everyone else types guesses in the chat.
   - A correct guess is hidden from the others and scores `100 + 400 × (time left ÷ draw time)` points.
   - A near miss (one letter off) gets a private "close!" nudge.
   - Letters are revealed as hints as time runs down (never more than half the word).
5. The turn ends when everyone has guessed or time runs out. The artist earns `300 × (correct guessers ÷ other players)`.
6. After the last round there's a podium. The host can start another game with the same bears.

Players who reload or briefly drop keep their seat and their score. The host can kick players; if the host leaves, the next player becomes host.

## Architecture

```
Browser ──POST /api/rooms/[code]/action ──▶ route handler ──lock──▶ Redis  room:{code}   (JSON game state)
        ──POST /api/rooms/[code]/draw   ──▶ route handler ──▶ RPUSH room:{code}:strokes:{turn} + PUBLISH
        ◀── GET  /api/rooms/[code]/events (SSE) ◀── per-instance Redis subscriber → local fan-out
```

- **Server-authoritative game engine** in `lib/game/engine.ts`: a pure reducer (`reduce(state, playerId, action, now)`) that is fully unit-tested. Words are never sent to players who shouldn't see them (`lib/game/redact.ts`).
- **Realtime** via Server-Sent Events + small POSTs. Every state change publishes a full snapshot, so reconnects and late joiners just replace their local state. Drawing strokes are vector segments, batched every ~100 ms and replayed exactly on reconnect.
- **Timers without cron**: the state stores when the current phase ends; clients ping a `tick` action when it's due and the server advances any expired phase (also at the start of any other action).
- **Redis** holds room state (6 h TTL), strokes for the current turn, and a short-lived lock per room. Without `REDIS_URL` the app falls back to an in-memory store — fine for local development, not for multi-instance deployments.
- **Vercel Hobby limits**: function duration is capped at 300 s, so each SSE stream closes itself at ~285 s and the browser's `EventSource` reconnects transparently.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000 — uses the in-memory store unless REDIS_URL is set
npm test           # game engine unit tests (Vitest)
npm run lint
npm run build
```

End-to-end scripts live in `e2e/` and run against any running instance (local or deployed):

```bash
BASE=http://localhost:3000 node e2e/api-smoke.mjs        # four scripted players play a full game
npm i --no-save playwright && npx playwright install chromium
BASE=http://localhost:3000 node e2e/ui-regression.mjs    # browser checks: phone layout, keyboard, word choice on later turns
```

To develop against a real Redis, put a `rediss://` (or `redis://`) URL in `.env.local` as `REDIS_URL` (or pull it from Vercel with `vercel env pull .env.local`).

## Deploying to Vercel

1. `vercel link` (or import the repo from the Vercel dashboard).
2. Add a Redis store from the [Vercel Marketplace](https://vercel.com/marketplace/category/storage) (Upstash's free tier is plenty) and connect it to the project. It sets `REDIS_URL` / `KV_URL` automatically.
3. Deploy: `vercel --prod`, or push to `main` with the GitHub integration connected.

## Project layout

```
app/
  page.tsx                      landing: name, avatar, create / join
  room/[code]/page.tsx          lobby + game
  api/rooms/...                 create, join, action, draw, events (SSE)
lib/game/                       engine, redaction, words, similarity
lib/redis.ts                    Store interface: ioredis + in-memory implementations
lib/rooms.ts                    load/save/lock/publish helpers, auth
hooks/useRoom.ts                SSE client, actions, stroke batching, timers
components/                     Canvas, Toolbar, Chat, PlayerList, Lobby, Game, Bear
tests/engine.test.ts            unit tests
e2e/                            API smoke test + Playwright UI regression scripts
```

## License

MIT
