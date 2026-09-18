import type { StrokeOp } from "@/lib/game/types";

export type Seg = Extract<StrokeOp, { t: "seg" }>;
export type StrokeEvent = { kind: "reset" } | { kind: "seg"; op: Seg };

/**
 * Holds the vector drawing for the current turn and notifies the canvas.
 * Shared between the network layer (useRoom) and the Canvas component.
 */
export class StrokeStore {
  turnId: string | null = null;
  ops: Seg[] = [];
  private listeners = new Set<(e: StrokeEvent) => void>();

  on(fn: (e: StrokeEvent) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(e: StrokeEvent) {
    for (const fn of this.listeners) fn(e);
  }

  reset(turnId: string | null, ops: StrokeOp[] = []) {
    this.turnId = turnId;
    this.ops = [];
    this.applyAll(ops, false);
    this.emit({ kind: "reset" });
  }

  apply(ops: StrokeOp[]) {
    this.applyAll(ops, true);
  }

  private applyAll(ops: StrokeOp[], notify: boolean) {
    let needsReset = false;
    for (const op of ops) {
      if (op.t === "clear") {
        this.ops = [];
        needsReset = true;
      } else if (op.t === "undo") {
        this.ops = this.ops.filter((o) => o.id !== op.id);
        needsReset = true;
      } else {
        this.ops.push(op);
        if (notify && !needsReset) this.emit({ kind: "seg", op });
      }
    }
    if (notify && needsReset) this.emit({ kind: "reset" });
  }

  /** Record a locally-drawn stroke without re-rendering it. */
  record(op: Seg) {
    this.ops.push(op);
  }

  lastStrokeId(): string | null {
    return this.ops.length ? this.ops[this.ops.length - 1].id : null;
  }
}

export const CANVAS_W = 800;
export const CANVAS_H = 600;

export function drawSeg(ctx: CanvasRenderingContext2D, op: Seg) {
  const { pts } = op;
  if (pts.length < 2) return;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pts.length === 2 || (pts.length === 4 && pts[0] === pts[2] && pts[1] === pts[3])) {
    ctx.beginPath();
    ctx.arc(pts[0], pts[1], op.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

export function redrawAll(ctx: CanvasRenderingContext2D, ops: Seg[]) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const op of ops) drawSeg(ctx, op);
}
