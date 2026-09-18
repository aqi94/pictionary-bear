import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, reduce } from "@/lib/game/engine";
import { redactForViewer } from "@/lib/game/redact";
import { judgeGuess, levenshtein } from "@/lib/game/similarity";
import { pickWords, WORDS } from "@/lib/game/words";
import { CHOOSE_TIME_MS, TURN_END_MS, type RoomState } from "@/lib/game/types";
import { normalizeCode, randomCode } from "@/lib/codes";

const T0 = 1_700_000_000_000;

function setup(n = 3) {
  let s = createRoom("ABCD", { id: "p1", name: "Ann", avatar: 0, token: "t1" }, T0);
  for (let i = 2; i <= n; i++) s = addPlayer(s, { id: `p${i}`, name: `P${i}`, avatar: i % 8, token: `t${i}` }, T0);
  for (let i = 1; i <= n; i++) s = reduce(s, `p${i}`, { type: "connect", connId: `c${i}` }, T0).state;
  return s;
}

function start(s: RoomState, now = T0) {
  return reduce(s, s.hostId, { type: "start" }, now).state;
}

function drawing(n = 3, now = T0) {
  let s = start(setup(n), now);
  s = reduce(s, s.turn!.drawerId, { type: "choose_word", index: 0 }, now).state;
  return s;
}

describe("codes", () => {
  it("generates readable 4-char codes", () => {
    for (let i = 0; i < 50; i++) {
      const c = randomCode();
      expect(c).toHaveLength(4);
      expect(c).not.toMatch(/[01IO]/);
      expect(normalizeCode(c.toLowerCase())).toBe(c);
    }
    expect(normalizeCode("ab")).toBeNull();
    expect(normalizeCode("ab-cd")).toBe("ABCD");
    expect(normalizeCode("A0CD")).toBeNull();
  });
});

describe("words", () => {
  it("has a healthy word list", () => {
    expect(WORDS.easy.length).toBeGreaterThan(150);
    expect(WORDS.medium.length).toBeGreaterThan(150);
    expect(WORDS.hard.length).toBeGreaterThan(100);
    expect(WORDS.easy).toContain("ice cream");
    expect(WORDS.hard).toContain("once upon a time");
  });
  it("avoids used words", () => {
    const used = WORDS.easy.slice(0, WORDS.easy.length - 3);
    const picks = pickWords("easy", used, 3);
    expect(picks).toHaveLength(3);
    for (const p of picks) expect(used).not.toContain(p);
  });
});

describe("similarity", () => {
  it("levenshtein", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
  it("judges guesses", () => {
    expect(judgeGuess(" Ice-Cream ", "ice cream")).toBe("correct");
    expect(judgeGuess("elephnt", "elephant")).toBe("close");
    expect(judgeGuess("cow", "cat")).toBe("wrong");
    expect(judgeGuess("ca", "cat")).toBe("wrong"); // short words never "close"
    expect(judgeGuess("", "cat")).toBe("wrong");
  });
});

describe("lobby", () => {
  it("creates a room with the host and adds players with unique names", () => {
    let s = createRoom("ABCD", { id: "p1", name: "Ann", avatar: 0, token: "t1" }, T0);
    s = addPlayer(s, { id: "p2", name: "ann", avatar: 1, token: "t2" }, T0);
    expect(s.players.map((p) => p.name)).toEqual(["Ann", "ann 2"]);
    expect(s.hostId).toBe("p1");
    expect(s.secrets).toEqual({ p1: "t1", p2: "t2" });
  });

  it("rejects when full and rejects start with < 2 connected", () => {
    let s = setup(2);
    s = reduce(s, "p1", { type: "update_settings", settings: { maxPlayers: 2 } }, T0).state;
    expect(() => addPlayer(s, { id: "p3", name: "x", avatar: 0, token: "t" }, T0)).toThrow(/full/);
    s = reduce(s, "p2", { type: "disconnect", connId: "c2" }, T0).state;
    expect(() => reduce(s, "p1", { type: "start" }, T0)).toThrow(/2 connected/);
  });

  it("only the host can change settings or start", () => {
    const s = setup(2);
    expect(() => reduce(s, "p2", { type: "update_settings", settings: { rounds: 5 } }, T0)).toThrow(/host/);
    expect(() => reduce(s, "p2", { type: "start" }, T0)).toThrow(/host/);
    expect(() => reduce(s, "p1", { type: "update_settings", settings: { rounds: 99 } }, T0)).toThrow(/rounds/);
  });

  it("disconnect only applies for the matching connection id", () => {
    let s = setup(2);
    s = reduce(s, "p2", { type: "connect", connId: "c2b" }, T0).state;
    s = reduce(s, "p2", { type: "disconnect", connId: "c2" }, T0).state; // stale
    expect(s.players[1].connected).toBe(true);
    s = reduce(s, "p2", { type: "disconnect", connId: "c2b" }, T0).state;
    expect(s.players[1].connected).toBe(false);
  });

  it("transfers host when the host leaves", () => {
    let s = setup(3);
    s = reduce(s, "p1", { type: "leave" }, T0).state;
    expect(s.players.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(s.hostId).toBe("p2");
    expect(s.secrets.p1).toBeUndefined();
  });
});

describe("turn flow", () => {
  it("start -> choosing with 3 choices for the drawer only", () => {
    const s = start(setup(3));
    expect(s.phase).toBe("choosing");
    expect(s.round).toBe(1);
    expect(s.turn!.drawerId).toBe("p1");
    expect(s.turn!.choices).toHaveLength(3);
    expect(s.phaseEndsAt).toBe(T0 + CHOOSE_TIME_MS);
    const drawerView = redactForViewer(s, "p1", T0);
    const guesserView = redactForViewer(s, "p2", T0);
    expect(drawerView.turn!.choices).toHaveLength(3);
    expect(guesserView.turn!.choices).toBeUndefined();
    expect(guesserView.turn!.word).toBeUndefined();
  });

  it("auto-picks a word when choosing times out", () => {
    const s0 = start(setup(2));
    const { state: s, changed } = reduce(s0, "p2", { type: "tick" }, T0 + CHOOSE_TIME_MS + 1);
    expect(changed).toBe(true);
    expect(s.phase).toBe("drawing");
    expect(s.turn!.word).toBe(s0.turn!.choices[0]);
    // Drawing timer starts from the moment choosing expired, not from the tick.
    expect(s.phaseEndsAt).toBe(T0 + CHOOSE_TIME_MS + s.settings.drawTime * 1000);
  });

  it("tick without anything due is a no-op", () => {
    const s = start(setup(2));
    const r = reduce(s, "p2", { type: "tick" }, T0 + 10);
    expect(r.changed).toBe(false);
    expect(r.state.version).toBe(s.version);
  });

  it("correct guess awards time-based points and hides the word from others", () => {
    const s0 = drawing(3);
    const word = s0.turn!.word!;
    const now = T0 + 20_000; // 20s of 80s elapsed
    const s = reduce(s0, "p2", { type: "guess", text: word.toUpperCase() }, now).state;
    const expected = Math.round(100 + 400 * (60 / 80));
    expect(s.turn!.guessed.p2).toBe(expected);
    expect(s.players.find((p) => p.id === "p2")!.score).toBe(expected);
    expect(s.phase).toBe("drawing"); // p3 still guessing
    const last = s.chat[s.chat.length - 1];
    expect(last.kind).toBe("correct");
    expect(last.text).not.toContain(word);
    expect(redactForViewer(s, "p2", now).turn!.word).toBe(word);
    expect(redactForViewer(s, "p3", now).turn!.word).toBeUndefined();
    expect(redactForViewer(s, "p1", now).turn!.word).toBe(word);
  });

  it("close guess sends a private hint and wrong guess is public", () => {
    const s0 = drawing(3);
    const word = s0.turn!.word!;
    const close = word.slice(0, -1) + (word.endsWith("x") ? "y" : "x");
    let s = reduce(s0, "p2", { type: "guess", text: close }, T0 + 1000).state;
    const p2 = redactForViewer(s, "p2", T0 + 1000).chat;
    const p3 = redactForViewer(s, "p3", T0 + 1000).chat;
    expect(p2.some((m) => m.kind === "close")).toBe(true);
    expect(p3.some((m) => m.kind === "close")).toBe(false);
    expect(p3.some((m) => m.kind === "chat" && m.text === close)).toBe(true);
    expect(s.turn!.guessed.p2).toBeUndefined();

    s = reduce(s, "p3", { type: "guess", text: "zzzzzz" }, T0 + 2000).state;
    expect(redactForViewer(s, "p2", T0 + 2000).chat.at(-1)!.text).toBe("zzzzzz");
  });

  it("drawer and guessed players chat privately during drawing", () => {
    const s0 = drawing(3);
    const word = s0.turn!.word!;
    let s = reduce(s0, "p2", { type: "guess", text: word }, T0 + 1000).state;
    s = reduce(s, "p2", { type: "guess", text: "that was easy" }, T0 + 2000).state;
    s = reduce(s, "p1", { type: "guess", text: "nice one" }, T0 + 3000).state;
    const p3chat = redactForViewer(s, "p3", T0 + 3000).chat.map((m) => m.text);
    expect(p3chat).not.toContain("that was easy");
    expect(p3chat).not.toContain("nice one");
    const p1chat = redactForViewer(s, "p1", T0 + 3000).chat.map((m) => m.text);
    expect(p1chat).toContain("that was easy");
    expect(p1chat).toContain("nice one");
  });

  it("ends the turn early when everyone guessed and awards the drawer", () => {
    const s0 = drawing(3);
    const word = s0.turn!.word!;
    let s = reduce(s0, "p2", { type: "guess", text: word }, T0 + 1000).state;
    s = reduce(s, "p3", { type: "guess", text: word }, T0 + 2000).state;
    expect(s.phase).toBe("turn_end");
    expect(s.lastTurn!.reason).toBe("all_guessed");
    expect(s.lastTurn!.word).toBe(word);
    expect(s.lastTurn!.drawerPoints).toBe(300);
    expect(s.players.find((p) => p.id === "p1")!.score).toBe(300);
    expect(s.phaseEndsAt).toBe(T0 + 2000 + TURN_END_MS);
    // Everyone sees the word now.
    expect(redactForViewer(s, "p3", T0 + 2000).turn!.word).toBe(word);
  });

  it("times out a drawing turn and gives partial drawer points", () => {
    const s0 = drawing(3);
    const word = s0.turn!.word!;
    let s = reduce(s0, "p2", { type: "guess", text: word }, T0 + 1000).state;
    const end = s.phaseEndsAt!;
    s = reduce(s, "p3", { type: "tick" }, end + 5).state;
    expect(s.phase).toBe("turn_end");
    expect(s.lastTurn!.reason).toBe("timeout");
    expect(s.lastTurn!.drawerPoints).toBe(150);
  });

  it("reveals hints on schedule and never more than half the letters", () => {
    const s0 = drawing(2);
    const t = s0.turn!;
    const letters = t.word!.replace(/ /g, "").length;
    expect(t.hints.length).toBeLessThanOrEqual(Math.floor(letters / 2));
    expect(t.hints.length).toBeGreaterThan(0);
    const firstAt = t.hints[0].at;
    expect(redactForViewer(s0, "p2", T0).turn!.mask.every((c) => c === null || c === " ")).toBe(true);
    expect(redactForViewer(s0, "p2", T0).turn!.hintTimes[0]).toBe(firstAt);
    const r = reduce(s0, "p2", { type: "tick" }, firstAt);
    expect(r.changed).toBe(true);
    const mask = redactForViewer(r.state, "p2", firstAt).turn!.mask;
    expect(mask[t.hints[0].index]).toBe(t.word![t.hints[0].index]);
    expect(mask.filter((c) => c !== null && c !== " ")).toHaveLength(1);
    // Drawer always sees the full word.
    expect(redactForViewer(r.state, "p1", firstAt).turn!.mask.join("")).toBe(t.word);
  });

  it("rotates drawers, counts rounds, and ends the game", () => {
    let s = setup(2);
    s = reduce(s, "p1", { type: "update_settings", settings: { rounds: 2, drawTime: 30 } }, T0).state;
    s = start(s);
    const order: string[] = [];
    let now = T0;
    for (let i = 0; i < 4; i++) {
      expect(s.phase).toBe("choosing");
      order.push(s.turn!.drawerId);
      now = s.phaseEndsAt! + 1;
      s = reduce(s, "p2", { type: "tick" }, now).state; // auto choose
      expect(s.phase).toBe("drawing");
      now = s.phaseEndsAt! + 1;
      s = reduce(s, "p2", { type: "tick" }, now).state; // timeout
      expect(s.phase).toBe("turn_end");
      now = s.phaseEndsAt! + 1;
      s = reduce(s, "p2", { type: "tick" }, now).state;
    }
    expect(order).toEqual(["p1", "p2", "p1", "p2"]);
    expect(s.phase).toBe("game_over");
    expect(s.phaseEndsAt).toBeNull();
    expect(s.usedWords).toHaveLength(4);
    // Play again resets scores and goes back to the lobby.
    s = reduce(s, "p1", { type: "play_again" }, now).state;
    expect(s.phase).toBe("lobby");
    expect(s.players.every((p) => p.score === 0)).toBe(true);
  });

  it("a single tick can advance through several expired phases", () => {
    const s0 = start(setup(2));
    const far = T0 + CHOOSE_TIME_MS + 80_000 + TURN_END_MS + 10;
    const s = reduce(s0, "p2", { type: "tick" }, far).state;
    // Choosing expired -> drawing expired -> turn_end expired -> next drawer choosing.
    expect(s.phase).toBe("choosing");
    expect(s.turn!.drawerId).toBe("p2");
  });

  it("skips disconnected drawers", () => {
    let s = setup(3);
    s = start(s);
    s = reduce(s, "p2", { type: "disconnect", connId: "c2" }, T0).state;
    s = reduce(s, "p1", { type: "choose_word", index: 1 }, T0).state;
    let now = s.phaseEndsAt! + 1;
    s = reduce(s, "p3", { type: "tick" }, now).state; // timeout -> turn_end
    now = s.phaseEndsAt! + 1;
    s = reduce(s, "p3", { type: "tick" }, now).state;
    expect(s.phase).toBe("choosing");
    expect(s.turn!.drawerId).toBe("p3");
  });

  it("ends the turn when the drawer leaves mid-drawing", () => {
    const s0 = drawing(3);
    const s = reduce(s0, "p1", { type: "leave" }, T0 + 500).state;
    expect(s.phase).toBe("turn_end");
    expect(s.lastTurn!.reason).toBe("drawer_left");
    expect(s.hostId).toBe("p2");
  });

  it("returns to the lobby when too few players remain", () => {
    const s0 = drawing(2);
    const s = reduce(s0, "p2", { type: "leave" }, T0 + 500).state;
    expect(s.phase).toBe("lobby");
    expect(s.players).toHaveLength(1);
  });

  it("kick requires host and removes the player", () => {
    const s0 = setup(3);
    expect(() => reduce(s0, "p2", { type: "kick", targetId: "p3" }, T0)).toThrow(/host/);
    const s = reduce(s0, "p1", { type: "kick", targetId: "p3" }, T0).state;
    expect(s.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(() => reduce(s, "p3", { type: "guess", text: "hi" }, T0)).toThrow(/not in this room/);
  });

  it("drawer cannot score by guessing", () => {
    const s0 = drawing(2);
    const s = reduce(s0, "p1", { type: "guess", text: s0.turn!.word! }, T0 + 100).state;
    expect(s.turn!.guessed).toEqual({});
    expect(s.phase).toBe("drawing");
  });

  it("redaction never leaks secrets", () => {
    const s = drawing(3);
    const view = JSON.stringify(redactForViewer(s, "p3", T0));
    expect(view).not.toContain("t1");
    expect(view).not.toContain("secrets");
    expect(view).not.toContain(`"word"`);
  });

  it("reduce never mutates its input", () => {
    const s0 = drawing(2);
    const frozen = JSON.stringify(s0);
    reduce(s0, "p2", { type: "guess", text: s0.turn!.word! }, T0 + 100);
    expect(JSON.stringify(s0)).toBe(frozen);
  });
});
