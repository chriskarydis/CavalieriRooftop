"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import type { FloorShape } from "@/server/db/schema";
import { FloorBackdrop, TableGlyph } from "@/ui/floor-plan/FloorPlan";
import { saveFloorLayoutAction } from "../floor-actions";

export interface EditorTable {
  id: string;
  number: number;
  isSpare: boolean;
  capacity: number;
  maxCapacity: number;
  active: boolean;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: "RECT" | "ROUND";
}

const GRID = 5;
const NUDGE = 5;
const MIN_SIZE = 30;
const MAX_SIZE = 600;
const snap = (value: number): number => Math.round(value / GRID) * GRID;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Floor-plan editor: drag tables (or use the arrow keys), then adjust size,
 * rotation and shape in the panel. Nothing is stored until "Save layout".
 */
export function FloorEditor({
  plan,
  initial,
  areaLabels,
}: {
  plan: { width: number; height: number; shapes: FloorShape[] };
  initial: EditorTable[];
  areaLabels: Record<string, string>;
}) {
  const t = useTranslations("floorEditor");
  const [tables, setTables] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const selected = tables.find((table) => table.id === selectedId) ?? null;

  const update = (id: string, change: Partial<EditorTable>) => {
    setTables((current) => current.map((table) => (table.id === id ? { ...table, ...change } : table)));
    setDirty(true);
  };

  /** Pointer position in floor-plan units. */
  const toPlan = (event: React.PointerEvent): { x: number; y: number } => {
    const box = svg.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * plan.width,
      y: ((event.clientY - box.top) / box.height) * plan.height,
    };
  };

  const onPointerDown = (table: EditorTable) => (event: React.PointerEvent<SVGGElement>) => {
    const point = toPlan(event);
    drag.current = { id: table.id, dx: point.x - table.x, dy: point.y - table.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(table.id);
  };
  const onPointerMove = (event: React.PointerEvent<SVGGElement>) => {
    if (!drag.current) return;
    const point = toPlan(event);
    update(drag.current.id, {
      x: clamp(snap(point.x - drag.current.dx), 0, plan.width),
      y: clamp(snap(point.y - drag.current.dy), 0, plan.height),
    });
  };
  const onKeyDown = (table: EditorTable) => (event: React.KeyboardEvent) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    };
    const move = step[event.key];
    if (!move) return;
    event.preventDefault();
    update(table.id, { x: clamp(table.x + move[0], 0, plan.width), y: clamp(table.y + move[1], 0, plan.height) });
  };

  const save = () =>
    startSaving(async () => {
      await saveFloorLayoutAction(
        JSON.stringify(tables.map(({ id, x, y, width, height, rotation, shape }) => ({ id, x, y, width, height, rotation, shape }))),
      );
    });

  const numberField = (key: "x" | "y" | "width" | "height" | "rotation", min: number, max: number) =>
    selected && (
      <label className="text-sm font-medium">
        {t(key)}
        <input
          type="number"
          min={min}
          max={max}
          step={key === "rotation" ? 15 : GRID}
          value={Math.round(selected[key])}
          onChange={(event) => update(selected.id, { [key]: clamp(Number(event.target.value), min, max) })}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 font-normal"
        />
      </label>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_1fr] 2xl:grid-cols-[minmax(0,44rem)_1fr]">
      <div className="rounded-lg border border-line bg-white shadow-sm p-3">
        <svg ref={svg} viewBox={`0 0 ${plan.width} ${plan.height}`} role="group" aria-label={t("title")} className="h-auto w-full touch-none select-none">
          <FloorBackdrop shapes={plan.shapes} areaLabels={areaLabels} />
          {tables.map((table) => {
            const isSelected = table.id === selectedId;
            return (
              <g
                key={table.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={t("tableAria", { number: table.isSpare ? "S" : String(table.number) })}
                transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}
                opacity={table.active ? 1 : 0.45}
                className="cursor-move outline-none focus-visible:[&>.tabletop]:stroke-[#1e1b17] focus-visible:[&>.tabletop]:[stroke-width:9]"
                onPointerDown={onPointerDown(table)}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onFocus={() => setSelectedId(table.id)}
                onKeyDown={onKeyDown(table)}
              >
                <TableGlyph table={table} centre={{ x: plan.width / 2, y: plan.height / 2 }} selected={isSelected} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-white shadow-sm p-4">
          {!selected ? (
            <p className="text-sm text-slate-600">{t("selectPrompt")}</p>
          ) : (
            <div className="space-y-3">
              <h2 className="font-semibold">{t("tableAria", { number: selected.isSpare ? "S" : String(selected.number) })}</h2>
              <div className="grid grid-cols-2 gap-3">
                {numberField("x", 0, plan.width)}
                {numberField("y", 0, plan.height)}
                {numberField("width", MIN_SIZE, MAX_SIZE)}
                {numberField("height", MIN_SIZE, MAX_SIZE)}
                {numberField("rotation", -180, 180)}
                <label className="text-sm font-medium">
                  {t("shape")}
                  <select
                    value={selected.shape}
                    onChange={(event) => update(selected.id, { shape: event.target.value as "RECT" | "ROUND" })}
                    className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 font-normal"
                  >
                    <option value="RECT">{t("rect")}</option>
                    <option value="ROUND">{t("round")}</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="rounded bg-ink hover:bg-gold-deep px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              setTables(initial);
              setDirty(false);
            }}
            className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            {t("reset")}
          </button>
          {dirty && (
            <span role="status" className="text-sm text-amber-800">
              {t("unsaved")}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">{t("help")}</p>
      </div>
    </div>
  );
}
