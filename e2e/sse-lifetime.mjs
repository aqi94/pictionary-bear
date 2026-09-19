// Holds an SSE connection open for its full ~285 s lifetime, then checks the reconnect snapshot.
// Usage: BASE=https://pictionary-bear.vercel.app node e2e/sse-lifetime.mjs
const BASE = process.env.BASE || "https://pictionary-bear.vercel.app";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const host = await (await fetch(BASE + "/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Holder", avatar: 0 }) })).json();
const url = `${BASE}/api/rooms/${host.code}/events?playerId=${host.playerId}&token=${host.token}`;

async function hold(label) {
  const start = Date.now();
  const res = await fetch(url);
  log(label, "status", res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let events = 0, heartbeats = 0, sawSnapshot = false, lastComment = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = dec.decode(value);
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) { events++; if (line.includes('"snapshot"')) sawSnapshot = true; }
      if (line.startsWith(":")) { heartbeats++; lastComment = line; }
    }
  }
  const secs = Math.round((Date.now() - start) / 1000);
  log(label, `closed by server after ${secs}s; events=${events} heartbeats=${heartbeats} snapshot=${sawSnapshot} last="${lastComment}"`);
  return { secs, sawSnapshot, lastComment };
}

const first = await hold("conn1");
const second = await (async () => {
  // reconnect immediately, just confirm a fresh snapshot arrives, then stop
  const res = await fetch(url);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes('"snapshot"')) { await reader.cancel(); return true; }
  }
  return false;
})();
log("reconnect snapshot:", second);
const ok = first.secs >= 270 && first.secs <= 300 && first.sawSnapshot && first.lastComment.includes("reconnect") && second;
log(ok ? "SSE LIFECYCLE OK" : "SSE LIFECYCLE UNEXPECTED");
process.exit(ok ? 0 : 1);
