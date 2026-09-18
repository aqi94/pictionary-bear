import type { ChatMessage, RoomState, RoomView, TurnView } from "./types";

export function canSeeWord(state: RoomState, viewerId: string): boolean {
  const t = state.turn;
  if (!t) return false;
  if (state.phase === "turn_end") return true;
  if (t.drawerId === viewerId) return true;
  return viewerId in t.guessed;
}

export function maskWord(word: string, revealed: Set<number>): (string | null)[] {
  return Array.from(word).map((ch, i) => (ch === " " ? " " : revealed.has(i) ? ch : null));
}

export function chatVisibleTo(msg: ChatMessage, state: RoomState, viewerId: string): boolean {
  switch (msg.visibility) {
    case "all":
      return true;
    case "private":
      return msg.to === viewerId;
    case "guessed": {
      const t = state.turn;
      if (state.phase !== "drawing" || !t) return true;
      return t.drawerId === viewerId || viewerId in t.guessed || msg.playerId === viewerId;
    }
  }
}

export function redactForViewer(state: RoomState, viewerId: string, now: number): RoomView {
  let turn: TurnView | null = null;
  const t = state.turn;
  if (t) {
    const seeWord = canSeeWord(state, viewerId);
    const revealed = new Set<number>();
    if (!seeWord) for (let i = 0; i < t.hintsShown; i++) revealed.add(t.hints[i].index);
    const word = t.word ?? "";
    turn = {
      id: t.id,
      round: t.round,
      drawerId: t.drawerId,
      mask: word ? (seeWord ? Array.from(word) : maskWord(word, revealed)) : [],
      hintTimes: seeWord ? [] : t.hints.slice(t.hintsShown).map((h) => h.at),
      guessed: Object.keys(t.guessed),
      drawEndsAt: t.drawEndsAt,
    };
    if (seeWord && t.word) turn.word = t.word;
    if (state.phase === "choosing" && t.drawerId === viewerId) turn.choices = [...t.choices];
  }
  return {
    code: state.code,
    hostId: state.hostId,
    settings: { ...state.settings },
    players: state.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.connected })),
    phase: state.phase,
    phaseId: state.phaseId,
    phaseEndsAt: state.phaseEndsAt,
    round: state.round,
    turn,
    lastTurn: state.lastTurn ? { ...state.lastTurn, guesserPoints: { ...state.lastTurn.guesserPoints } } : null,
    chat: state.chat.filter((m) => chatVisibleTo(m, state, viewerId)),
    version: state.version,
    me: viewerId,
    serverNow: now,
  };
}
