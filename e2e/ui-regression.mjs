// Browser regression checks (Playwright): word choice on later turns, phone layout with many
// players, chat growth, on-screen keyboard, and scaled-canvas pointer mapping.
// Usage: npm i --no-save playwright && npx playwright install chromium
//        BASE=http://localhost:3000 node e2e/ui-regression.mjs
// Optional: PW_EXE=<path to a chromium binary>, OUT=<dir for screenshots>
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function api(path, { body, id } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (id) Object.assign(headers, { "x-player-id": id.playerId, "x-player-token": id.token });
  const res = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${data.error}`);
  return data;
}
const act = (code, id, body) => api(`/api/rooms/${code}/action`, { id, body });

const browser = await chromium.launch({ executablePath: process.env.PW_EXE || undefined });
const errors = [];
async function pageFor(code, id, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`pb:room:${code}`, JSON.stringify({ playerId: id.playerId, token: id.token })]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/room/${code}`);
  return page;
}
const choiceBtns = (page) => page.locator(".animate-pop .grid .btn");

// ---------------------------------------------------------------- A: word choice on later turns
{
  const ann = await api("/api/rooms", { body: { name: "Ann", avatar: 1 } });
  const code = ann.code;
  const bob = await api(`/api/rooms/${code}/join`, { body: { name: "Bob", avatar: 6 } });
  const pages = { [ann.playerId]: await pageFor(code, ann, { width: 1280, height: 800 }), [bob.playerId]: await pageFor(code, bob, { width: 1280, height: 800 }) };
  const ids = { [ann.playerId]: ann, [bob.playerId]: bob };
  await pages[ann.playerId].getByRole("button", { name: "Start game" }).waitFor({ timeout: 15000 });
  await act(code, ann, { type: "update_settings", settings: { rounds: 3, drawTime: 30 } });
  await pages[ann.playerId].getByRole("button", { name: "Start game" }).click();

  let lastTurnId = null;
  for (let turn = 1; turn <= 6; turn++) {
    let room;
    for (let i = 0; i < 60; i++) {
      room = (await act(code, ann, { type: "tick" })).room;
      if (room.phase === "choosing" && room.turn.id !== lastTurnId) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    lastTurnId = room.turn.id;
    const drawerId = room.turn.drawerId;
    const guesserId = Object.keys(pages).find((p) => p !== drawerId);
    const dp = pages[drawerId];
    await dp.getByText("Choose your word").waitFor({ timeout: 12000 });
    const btn = choiceBtns(dp).first();
    const enabled = await btn.isEnabled();
    let picked = false;
    if (enabled) {
      const t0 = Date.now();
      await btn.click();
      await dp.getByText("Draw this").waitFor({ timeout: 5000 }).then(() => (picked = Date.now() - t0 < 5000)).catch(() => {});
    }
    check(`A: turn ${turn} (${room.players.find((p) => p.id === drawerId).name}) can choose a word`, enabled && picked, enabled ? "" : "choice buttons disabled");
    if (!picked) await dp.getByText("Draw this").waitFor({ timeout: 20000 }); // auto-pick fallback so the run continues
    const word = (await act(code, ids[drawerId], { type: "tick" })).room.turn.word;
    await act(code, ids[guesserId], { type: "guess", text: word });
  }
  for (const p of Object.values(pages)) await p.context().close();
}

// ---------------------------------------------------------------- B/C: phone layout
{
  const host = await api("/api/rooms", { body: { name: "Hostbear", avatar: 1 } });
  const code = host.code;
  const cat = await api(`/api/rooms/${code}/join`, { body: { name: "Cat", avatar: 3 } });
  for (const n of ["Dan", "Eve", "Finn"]) await api(`/api/rooms/${code}/join`, { body: { name: n, avatar: 2 } });
  const hostP = await pageFor(code, host, { width: 390, height: 844 }, { touch: true });
  const catP = await pageFor(code, cat, { width: 390, height: 844 }, { touch: true });
  await hostP.getByRole("button", { name: "Start game" }).waitFor({ timeout: 15000 });
  await catP.getByText("Waiting for Hostbear").waitFor({ timeout: 15000 });

  const lobbyW = await catP.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check("B: lobby has no horizontal overflow on a phone", lobbyW.sw <= lobbyW.iw + 1, `scrollWidth ${lobbyW.sw} vs ${lobbyW.iw}`);

  await act(code, host, { type: "update_settings", settings: { rounds: 1, drawTime: 120 } });
  await hostP.getByRole("button", { name: "Start game" }).click();
  await hostP.getByText("Choose your word").waitFor({ timeout: 12000 });
  await choiceBtns(hostP).first().click();
  await catP.getByText("is drawing").first().waitFor({ timeout: 8000 });

  const m1 = await catP.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, c: document.querySelector("canvas").getBoundingClientRect().toJSON() }));
  check("B: game has no horizontal overflow with 5 players (iOS zoom-out cause)", m1.sw <= m1.iw + 1, `scrollWidth ${m1.sw} vs ${m1.iw}`);
  check("B: canvas fits within the screen width", m1.c.right <= m1.iw + 1, `canvas right edge ${Math.round(m1.c.right)} vs ${m1.iw}`);

  for (let i = 1; i <= 45; i++) await act(code, cat, { type: "guess", text: `guess number ${i}` });
  await catP.getByText("guess number 45").waitFor({ timeout: 8000 });
  await catP.waitForTimeout(300);
  const m2 = await catP.evaluate(() => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    const input = document.querySelector('input[aria-label="Chat message"]').getBoundingClientRect();
    return { sh: document.documentElement.scrollHeight, ih: window.innerHeight, cTop: c.top, cBottom: c.bottom, inBottom: input.bottom };
  });
  check("A2: page does not grow as chat fills (Android scroll)", m2.sh <= m2.ih + 1, `scrollHeight ${m2.sh} vs ${m2.ih}`);
  check("A2: canvas and chat input both stay on screen", m2.cTop >= 0 && m2.cBottom <= m2.ih && m2.inBottom <= m2.ih + 1, `canvas ${Math.round(m2.cTop)}–${Math.round(m2.cBottom)}, input bottom ${Math.round(m2.inBottom)} of ${m2.ih}`);
  const lastVisible = await catP.getByText("guess number 45").isVisible();
  check("A2: chat stays scrolled to the newest message", lastVisible);

  // C: keyboard open ≈ short viewport
  await catP.setViewportSize({ width: 390, height: 430 });
  await catP.waitForTimeout(400);
  const m3 = await catP.evaluate(() => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    const input = document.querySelector('input[aria-label="Chat message"]').getBoundingClientRect();
    return { sh: document.documentElement.scrollHeight, ih: window.innerHeight, ch: c.height, cTop: c.top, cBottom: c.bottom, inBottom: input.bottom };
  });
  check("C: with the keyboard up, canvas + guess box still fit without scrolling", m3.sh <= m3.ih + 1 && m3.ch >= 100 && m3.cTop >= 0 && m3.cBottom <= m3.ih && m3.inBottom <= m3.ih + 1, `canvas h ${Math.round(m3.ch)}, scrollHeight ${m3.sh} vs ${m3.ih}`);

  // C2: drawing still maps correctly when the canvas box is letterboxed (drawer on a short screen)
  await hostP.setViewportSize({ width: 390, height: 480 });
  await hostP.waitForTimeout(400);
  const hit = await hostP.evaluate(async () => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const scale = Math.min(r.width / c.width, r.height / c.height);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // target logical point (200,150) = upper-left quadrant
    const x = cx + (200 - c.width / 2) * scale, y = cy + (150 - c.height / 2) * scale;
    return { x, y };
  });
  await hostP.mouse.move(hit.x, hit.y);
  await hostP.mouse.down();
  await hostP.mouse.move(hit.x + 1, hit.y + 1);
  await hostP.mouse.up();
  await hostP.waitForTimeout(500);
  const px = await hostP.evaluate(() => {
    const c = document.querySelector("canvas");
    const d = c.getContext("2d").getImageData(200, 150, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  check("C2: a tap lands on the right canvas pixel when the canvas is scaled", px[0] < 60 && px[1] < 60 && px[2] < 60, `pixel at (200,150) = ${px}`);
  const pxGuest = await catP.evaluate(() => {
    const d = document.querySelector("canvas").getContext("2d").getImageData(200, 150, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  check("C2: the guesser sees that same stroke", pxGuest[0] < 60, `pixel = ${pxGuest}`);
  await hostP.screenshot({ path: process.env.OUT ? `${process.env.OUT}/kb-drawer.png` : "kb-drawer.png" });
  await catP.screenshot({ path: process.env.OUT ? `${process.env.OUT}/kb-guesser.png` : "kb-guesser.png" });
  await catP.setViewportSize({ width: 390, height: 844 });
  await catP.waitForTimeout(300);
  await catP.screenshot({ path: process.env.OUT ? `${process.env.OUT}/phone-5players.png` : "phone-5players.png" });
}

// ---------------------------------------------------------------- D: desktop chat growth
{
  const host = await api("/api/rooms", { body: { name: "Deskbear", avatar: 1 } });
  const code = host.code;
  const bob = await api(`/api/rooms/${code}/join`, { body: { name: "Bob", avatar: 6 } });
  const hostP = await pageFor(code, host, { width: 1280, height: 720 });
  const bobP = await pageFor(code, bob, { width: 1280, height: 720 });
  await hostP.getByRole("button", { name: "Start game" }).waitFor({ timeout: 15000 });
  await bobP.getByText("Waiting for Deskbear").waitFor({ timeout: 15000 });
  await hostP.getByRole("button", { name: "Start game" }).click();
  await hostP.getByText("Choose your word").waitFor({ timeout: 12000 });
  await choiceBtns(hostP).first().click();
  for (let i = 1; i <= 45; i++) await act(code, bob, { type: "guess", text: `desk guess ${i}` });
  await bobP.getByText("desk guess 45").waitFor({ timeout: 8000 });
  const m = await bobP.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  check("D: desktop page does not grow as chat fills", m.sh <= m.ih + 1, `scrollHeight ${m.sh} vs ${m.ih}`);
  await bobP.screenshot({ path: process.env.OUT ? `${process.env.OUT}/desktop-longchat.png` : "desktop-longchat.png" });
}

await browser.close();
if (errors.length) console.log("PAGE ERRORS:", errors);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
