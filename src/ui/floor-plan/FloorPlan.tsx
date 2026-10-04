import type { FloorPlanView, FloorTableView } from "./types";

export interface FloorPlanTable extends FloorTableView {
  /** Accessible name, e.g. "Table 12, 4 guests, Preferred, available". */
  label: string;
  /** Can be clicked or activated with the keyboard. */
  selectable?: boolean;
}

/**
 * Data-driven SVG floor plan. Purely presentational: it draws the tables and
 * static shapes it is given and decides nothing about availability or price.
 * Coordinates are in the plan's own unit space, so the drawing scales to any
 * container through the viewBox. Works as a server or a client component.
 */
export function FloorPlan({
  plan,
  tables,
  title,
  areaLabels,
  selectedIds = [],
  onSelect,
}: {
  plan: Pick<FloorPlanView, "width" | "height" | "shapes">;
  tables: FloorPlanTable[];
  title: string;
  areaLabels: Record<string, string>;
  selectedIds?: readonly string[];
  onSelect?: (tableId: string) => void;
}) {
  return (
    <svg viewBox={`0 0 ${plan.width} ${plan.height}`} role="group" aria-label={title} className="h-auto w-full">
      {plan.shapes.map((shape, index) => {
        if (shape.type === "rect") {
          return (
            <rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill="none"
              stroke="#1f2a30"
              strokeWidth={6}
              strokeDasharray="4 14"
            />
          );
        }
        if (shape.type === "polyline") {
          return (
            <polyline
              key={index}
              points={shape.points.map((point) => point.join(",")).join(" ")}
              fill="none"
              stroke="#1f2a30"
              strokeWidth={3}
            />
          );
        }
        return (
          <text key={index} x={shape.x} y={shape.y} textAnchor="middle" fontSize={28} fill="#5b6870">
            {areaLabels[shape.key] ?? shape.key}
          </text>
        );
      })}

      {tables.map((table) => {
        const selected = selectedIds.includes(table.id);
        const interactive = Boolean(onSelect && table.selectable);
        const outline = { stroke: selected ? "#111827" : "none", strokeWidth: selected ? 10 : 0 };
        return (
          <g
            key={table.id}
            role={interactive ? "button" : "img"}
            aria-label={table.label}
            aria-pressed={interactive ? selected : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={interactive ? () => onSelect?.(table.id) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(table.id);
                    }
                  }
                : undefined
            }
            transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}
            opacity={table.muted ? 0.35 : 1}
            className={interactive ? "cursor-pointer outline-none focus-visible:[&>:first-child]:stroke-[#111827] focus-visible:[&>:first-child]:[stroke-width:10]" : undefined}
          >
            {table.shape === "ROUND" ? (
              <ellipse rx={table.width / 2} ry={table.height / 2} fill={table.color} {...outline} />
            ) : (
              <rect
                x={-table.width / 2}
                y={-table.height / 2}
                width={table.width}
                height={table.height}
                rx={22}
                fill={table.color}
                {...outline}
              />
            )}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={30}
              fontWeight={700}
              fill="#ffffff"
              transform={`rotate(${-table.rotation})`}
              pointerEvents="none"
            >
              {table.isSpare ? "S" : table.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
