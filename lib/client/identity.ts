"use client";

import { useMemo, useSyncExternalStore } from "react";

export interface Profile {
  name: string;
  avatar: number;
}

export interface RoomIdentity {
  playerId: string;
  token: string;
}

const PROFILE_KEY = "pb:profile";
const roomKey = (code: string) => `pb:room:${code}`;

// ---- tiny localStorage store with change notifications (works with useSyncExternalStore) ----

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  notify();
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Returns `undefined` during SSR/hydration, then the parsed value (or null). */
function useStoredValue<T>(key: string): T | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => undefined,
  );
  return useMemo(() => (raw === undefined ? undefined : parse<T>(raw)), [raw]);
}

// ---- profile ----

export function loadProfile(): Profile {
  return parse<Profile>(readRaw(PROFILE_KEY)) ?? { name: "", avatar: 0 };
}

export function saveProfile(p: Profile) {
  writeRaw(PROFILE_KEY, JSON.stringify(p));
}

export function useProfile(): Profile | undefined {
  const stored = useStoredValue<Profile>(PROFILE_KEY);
  return useMemo(() => (stored === undefined ? undefined : stored ?? { name: "", avatar: 0 }), [stored]);
}

// ---- per-room identity ----

export function loadIdentity(code: string): RoomIdentity | null {
  return parse<RoomIdentity>(readRaw(roomKey(code)));
}

export function saveIdentity(code: string, id: RoomIdentity) {
  writeRaw(roomKey(code), JSON.stringify(id));
}

export function clearIdentity(code: string) {
  writeRaw(roomKey(code), null);
}

export function useIdentity(code: string): RoomIdentity | null | undefined {
  return useStoredValue<RoomIdentity>(roomKey(code));
}
