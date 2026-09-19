"use client";

import { useEffect, useRef } from "react";
import { CANVAS_H, CANVAS_W, drawSeg, redrawAll, type Seg, type StrokeStore } from "@/lib/client/strokes";
import type { StrokeOp } from "@/lib/game/types";
import type { ToolState } from "./Toolbar";

const FLUSH_MS = 100;

export function Canvas({
  store,
  canDraw,
  tool,
  onOps,
  className = "",
}: {
  store: StrokeStore;
  canDraw: boolean;
  tool: ToolState;
  onOps: (ops: StrokeOp[]) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const toolRef = useRef(tool);
  const onOpsRef = useRef(onOps);
  useEffect(() => {
    toolRef.current = tool;
    onOpsRef.current = onOps;
  }, [tool, onOps]);

  // Replay / incremental rendering from the shared store.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctxRef.current = ctx;
    redrawAll(ctx, store.ops);
    return store.on((e) => {
      if (e.kind === "reset") redrawAll(ctx, store.ops);
      else drawSeg(ctx, e.op);
    });
  }, [store]);

  // Pointer drawing for the drawer.
  useEffect(() => {
    if (!canDraw) return;
    const canvas = canvasRef.current!;
    const ctx = ctxRef.current!;

    let current: { id: string; color: string; size: number; pts: number[]; sent: number } | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    // The bitmap is shown with `object-fit: contain`, so it may be letterboxed inside the element.
    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(r.width / CANVAS_W, r.height / CANVAS_H) || 1;
      const left = r.left + (r.width - CANVAS_W * scale) / 2;
      const top = r.top + (r.height - CANVAS_H * scale) / 2;
      const x = (e.clientX - left) / scale;
      const y = (e.clientY - top) / scale;
      return [Math.max(0, Math.min(CANVAS_W, x)), Math.max(0, Math.min(CANVAS_H, y))];
    };

    const flush = (final = false) => {
      if (!current) return;
      const { pts, sent } = current;
      if (pts.length <= sent && !(final && sent === 0)) return;
      // Overlap by one point so consecutive segments join seamlessly.
      const from = sent >= 2 ? sent - 2 : 0;
      let slice = pts.slice(from);
      if (slice.length === 2) slice = [slice[0], slice[1], slice[0], slice[1]];
      onOpsRef.current([{ t: "seg", id: current.id, color: current.color, size: current.size, pts: slice }]);
      current.sent = pts.length;
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const t = toolRef.current;
      const [x, y] = toLocal(e);
      current = {
        id: Math.random().toString(36).slice(2, 10),
        color: t.tool === "eraser" ? "#ffffff" : t.color,
        size: t.tool === "eraser" ? Math.max(t.size * 2, 16) : t.size,
        pts: [x, y],
        sent: 0,
      };
      drawSeg(ctx, { t: "seg", id: current.id, color: current.color, size: current.size, pts: [x, y, x, y] });
      flushTimer = setInterval(() => flush(), FLUSH_MS);
    };

    const move = (e: PointerEvent) => {
      if (!current) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const [x, y] = toLocal(ev);
        const n = current.pts.length;
        const px = current.pts[n - 2];
        const py = current.pts[n - 1];
        if (Math.abs(px - x) < 0.5 && Math.abs(py - y) < 0.5) continue;
        current.pts.push(x, y);
        drawSeg(ctx, { t: "seg", id: current.id, color: current.color, size: current.size, pts: [px, py, x, y] });
      }
    };

    const up = (e: PointerEvent) => {
      if (!current) return;
      e.preventDefault();
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = null;
      flush(true);
      const seg: Seg = { t: "seg", id: current.id, color: current.color, size: current.size, pts: current.pts.length >= 4 ? current.pts : [...current.pts, ...current.pts] };
      store.record(seg);
      current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      if (flushTimer) clearInterval(flushTimer);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [canDraw, store]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className={`absolute inset-0 block w-full h-full object-contain bg-white select-none ${canDraw ? "cursor-crosshair" : ""} ${className}`}
      style={{ touchAction: "none" }}
      aria-label={canDraw ? "Drawing canvas — draw here" : "Drawing canvas"}
    />
  );
}
