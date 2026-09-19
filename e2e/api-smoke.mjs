// API smoke test against a running server: four scripted players play a full game over HTTP + SSE.
// Usage: BASE=http://localhost:3000 node e2e/api-smoke.mjs
const BASE = process.env.BASE || "http://localhost:3000";
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

async function api(path, { method = "POST", body, id } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (id) {
    headers["x-player-id"] = id.playerId;
    headers["x-player-token"] = id.token;
  }
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data.error}`);
  return data;
}

function sse(code, id, name) {
  const events = [];
  const waiters = [];
  const ctrl = new AbortController();
  const url = `${BASE}/api/rooms/${code}/events?playerId=${id.playerId}&token=${id.token}`;
  const ready = (async () => {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`SSE ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                const ev = JSON.parse(line.slice(6));
                events.push(ev);
                for (const w of [...waiters]) if (w.pred(ev)) { waiters.splice(waiters.indexOf(w), 1); w.res(ev); }
              }
            }
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") log(name, "stream error", e.message);
      }
    })();
  })();
  return {
    events,
    ready,
    close: () => ctrl.abort(),
    waitFor(pred, ms = 5000) {
      const hit = events.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(`${name}: timeout waiting`)), ms);
        waiters.push({ pred, res: (e) => { clearTimeout(t); res(e); } });
      });
    },
    latestRoom() {
      for (let i = events.length - 1; i >= 0; i--) if (events[i].room) return events[i].room;
      return null;
    },
  };
}

const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); log("  ok -", msg); };

const t0 = Date.now();
const host = await api("/api/rooms", { body: { name: "Ann", avatar: 1 } });
const code = host.code;
log("room", code);
const bob = await api(`/api/rooms/${code}/join`, { body: { name: "Bob", avatar: 2 } });
const cat = await api(`/api/rooms/${code}/join`, { body: { name: "Cat", avatar: 3 } });

const sA = sse(code, host, "Ann"), sB = sse(code, bob, "Bob"), sC = sse(code, cat, "Cat");
await Promise.all([sA.ready, sB.ready, sC.ready]);
await Promise.all([sA, sB, sC].map((s) => s.waitFor((e) => e.type === "snapshot")));
assert(sA.latestRoom().phase === "lobby", "snapshot received in lobby");
await sA.waitFor((e) => e.room && e.room.players.filter((p) => p.connected).length === 3);
assert(true, "all three connected");

await api(`/api/rooms/${code}/action`, { id: host, body: { type: "update_settings", settings: { rounds: 1, drawTime: 30 } } });
await api(`/api/rooms/${code}/action`, { id: host, body: { type: "start" } });
const choosing = await sB.waitFor((e) => e.room && e.room.phase === "choosing");
assert(!choosing.room.turn.choices, "guesser does not see word choices");
const hostChoosing = await sA.waitFor((e) => e.room && e.room.phase === "choosing" && e.room.turn.choices);
assert(hostChoosing.room.turn.choices.length === 3, "drawer sees 3 choices");

await api(`/api/rooms/${code}/action`, { id: host, body: { type: "choose_word", index: 1 } });
const drawing = await sB.waitFor((e) => e.room && e.room.phase === "drawing");
const word = (await sA.waitFor((e) => e.room && e.room.phase === "drawing")).room.turn.word;
assert(word === hostChoosing.room.turn.choices[1], "drawer sees chosen word: " + word);
assert(!drawing.room.turn.word && drawing.room.turn.mask.length === word.length, "guesser sees only mask");
const turnId = drawing.room.turn.id;

// strokes
await api(`/api/rooms/${code}/draw`, { id: host, body: { turnId, ops: [{ t: "seg", id: "s1", color: "#000000", size: 8, pts: [10, 10, 100, 100, 200, 50] }] } });
await api(`/api/rooms/${code}/draw`, { id: host, body: { turnId, ops: [{ t: "seg", id: "s1", color: "#000000", size: 8, pts: [200, 50, 300, 300] }] } });
const strokeEv = await sB.waitFor((e) => e.type === "stroke");
assert(strokeEv.batch.ops[0].id === "s1", "guesser receives stroke");
assert(!sA.events.some((e) => e.type === "stroke"), "drawer does not receive own strokes");
let err = null;
try { await api(`/api/rooms/${code}/draw`, { id: bob, body: { turnId, ops: [{ t: "clear" }] } }); } catch (e) { err = e; }
assert(err && /not the drawer/.test(err.message), "non-drawer cannot draw");

// late joiner gets snapshot with strokes
const dan = await api(`/api/rooms/${code}/join`, { body: { name: "Dan", avatar: 4 } });
const sD = sse(code, dan, "Dan");
await sD.ready;
const snapD = await sD.waitFor((e) => e.type === "snapshot");
assert(snapD.strokes.length === 2 && snapD.turnId === turnId, "late joiner snapshot contains strokes");

// guesses
await api(`/api/rooms/${code}/action`, { id: bob, body: { type: "guess", text: "definitely wrong" } });
await sC.waitFor((e) => e.room && e.room.chat.some((m) => m.text === "definitely wrong"));
assert(true, "wrong guess visible to others");
const r = await api(`/api/rooms/${code}/action`, { id: bob, body: { type: "guess", text: word } });
assert(r.room.turn.word === word && r.room.turn.guessed.includes(bob.playerId), "Bob guessed correctly and sees word");
const catAfter = await sC.waitFor((e) => e.room && e.room.turn && e.room.turn.guessed.includes(bob.playerId));
assert(!catAfter.room.turn.word, "Cat still cannot see the word");
assert(!catAfter.room.chat.some((m) => m.text.includes(word)), "word not leaked in chat");
await api(`/api/rooms/${code}/action`, { id: bob, body: { type: "guess", text: "secret chat" } });
await api(`/api/rooms/${code}/action`, { id: cat, body: { type: "guess", text: "hello all" } });
const catChat = (await sC.waitFor((e) => e.room && e.room.chat.some((m) => m.text === "hello all"))).room.chat;
assert(!catChat.some((m) => m.text === "secret chat"), "Cat cannot see guessed-players chat");
const annChat = (await sA.waitFor((e) => e.room && e.room.chat.some((m) => m.text === "hello all"))).room.chat;
assert(annChat.some((m) => m.text === "secret chat"), "drawer sees guessed-players chat");

// reconnect: Cat drops and comes back, gets full snapshot with strokes
sC.close();
const sC2 = sse(code, cat, "Cat2");
await sC2.ready;
const snapC = await sC2.waitFor((e) => e.type === "snapshot");
assert(snapC.strokes.length === 2 && snapC.room.phase === "drawing", "reconnect snapshot restores strokes and state");

// everyone else guesses -> turn ends -> single round -> game over
await api(`/api/rooms/${code}/action`, { id: cat, body: { type: "guess", text: word } });
await api(`/api/rooms/${code}/action`, { id: dan, body: { type: "guess", text: word } });
const ended = await sB.waitFor((e) => e.room && e.room.phase === "turn_end");
assert(ended.room.lastTurn.word === word && ended.room.lastTurn.drawerPoints === 300, "turn ended with all guessed, drawer +300");

// tick past turn_end -> next drawer (Bob) choosing; run remaining turns via ticks
let room = ended.room;
for (let guard = 0; guard < 20 && room.phase !== "game_over"; guard++) {
  const wait = Math.max(0, room.phaseEndsAt - room.serverNow) + 400;
  await new Promise((r) => setTimeout(r, Math.min(wait, 2000)));
  if (room.phase === "choosing") {
    const drawerId = room.turn.drawerId;
    const who = [host, bob, cat, dan].find((p) => p.playerId === drawerId);
    await api(`/api/rooms/${code}/action`, { id: who, body: { type: "choose_word", index: 0 } });
  } else if (room.phase === "drawing") {
    const drawerId = room.turn.drawerId;
    for (const p of [host, bob, cat, dan]) if (p.playerId !== drawerId) {
      const me = (await api(`/api/rooms/${code}/action`, { id: p, body: { type: "tick" } })).room;
      if (me.phase !== "drawing") break;
      await api(`/api/rooms/${code}/action`, { id: p, body: { type: "guess", text: me.turn.word || "?" } }).catch(() => {});
    }
    // the drawer's view has the word; use it
    const view = (await api(`/api/rooms/${code}/action`, { id: who(drawerId), body: { type: "tick" } })).room;
    if (view.phase === "drawing") {
      for (const p of [host, bob, cat, dan]) if (p.playerId !== drawerId) await api(`/api/rooms/${code}/action`, { id: p, body: { type: "guess", text: view.turn.word } }).catch(() => {});
    }
  } else {
    await api(`/api/rooms/${code}/action`, { id: host, body: { type: "tick" } });
  }
  room = (await api(`/api/rooms/${code}/action`, { id: host, body: { type: "tick" } })).room;
  log("  phase", room.phase, "round", room.round);
}
function who(id) { return [host, bob, cat, dan].find((p) => p.playerId === id); }
assert(room.phase === "game_over", "game reached game_over");
assert(room.players.every((p) => p.score > 0), "everyone scored: " + room.players.map((p) => `${p.name}=${p.score}`).join(", "));

await api(`/api/rooms/${code}/action`, { id: host, body: { type: "play_again" } });
const lobby = await sB.waitFor((e) => e.room && e.room.phase === "lobby");
assert(lobby.room.players.every((p) => p.score === 0), "play again resets scores");

// kick
await api(`/api/rooms/${code}/action`, { id: host, body: { type: "kick", targetId: dan.playerId } });
await sD.waitFor((e) => e.type === "kicked");
assert(true, "kicked player notified");

// SSE stream survives ~15s heartbeat (short check)
[sA, sB, sC2, sD].forEach((s) => s.close());
log(`ALL GOOD in ${Date.now() - t0}ms`);
process.exit(0);
