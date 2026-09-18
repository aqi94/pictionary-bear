"use client";

export const PALETTE = [
  "#000000", "#6b4a2b", "#d95f4b", "#f5b32b", "#f7e04b", "#4e9a51",
  "#5aa9d6", "#3457d5", "#8e44ad", "#e58cb0", "#7f8c8d", "#ffffff",
];
export const SIZES = [4, 8, 14, 24];

export type Tool = "brush" | "eraser";

export interface ToolState {
  color: string;
  size: number;
  tool: Tool;
}

export function Toolbar({
  state,
  onChange,
  onUndo,
  onClear,
}: {
  state: ToolState;
  onChange: (s: ToolState) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 rounded-2xl border-3 border-bark bg-paper">
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1" role="radiogroup" aria-label="Color">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={state.tool === "brush" && state.color === c}
            aria-label={`Color ${c}`}
            onClick={() => onChange({ ...state, color: c, tool: "brush" })}
            className={`w-7 h-7 rounded-full border-2 transition ${state.tool === "brush" && state.color === c ? "border-bark scale-110 ring-2 ring-honey" : "border-bark/40"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush size">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={state.size === s}
            aria-label={`Size ${s}`}
            onClick={() => onChange({ ...state, size: s })}
            className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center ${state.size === s ? "border-bark bg-honey" : "border-bark/40 bg-paper"}`}
          >
            <span className="rounded-full bg-bark" style={{ width: Math.min(s, 22), height: Math.min(s, 22) }} />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          className={`btn btn-sm ${state.tool === "eraser" ? "" : "btn-secondary"}`}
          aria-pressed={state.tool === "eraser"}
          onClick={() => onChange({ ...state, tool: state.tool === "eraser" ? "brush" : "eraser" })}
          title="Eraser"
        >
          🧽 Eraser
        </button>
        <button type="button" className="btn btn-sm btn-secondary" onClick={onUndo} title="Undo last stroke">
          ↩ Undo
        </button>
        <button type="button" className="btn btn-sm btn-danger" onClick={onClear} title="Clear canvas">
          🗑 Clear
        </button>
      </div>
    </div>
  );
}
