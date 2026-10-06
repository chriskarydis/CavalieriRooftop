import type { FloorPlanView, FloorTableView } from "./types";

export interface FloorPlanTable extends FloorTableView {
  /** Accessible name, e.g. "Table 12, 4 guests, Preferred, available". */
  label: string;
  /** Can be clicked or activated with the keyboard. */
  selectable?: boolean;
  /** Colour of the table number; white unless the table colour is too pale for it. */
  numberColor?: string;
}

const INK = "#1e1b17";
const CHAIR_DEPTH = 13;
const CHAIR_GAP = 5;
const CHAIR_MAX_LENGTH = 44;

interface Chair {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Where to draw the chairs of a table, in the table's own coordinates. Purely
 * decorative: one chair per standard seat, along the two longer sides of a
 * rectangular table or evenly around a round one.
 */
function chairsFor(table: Pick<FloorTableView, "shape" | "width" | "height" | "capacity">): Chair[] {
  const { width, height, capacity } = table;
  if (table.shape === "ROUND") {
    const radius = Math.max(width, height) / 2 + CHAIR_GAP + CHAIR_DEPTH / 2;
    return Array.from({ length: capacity }, (_, index) => {
      const angle = (index / capacity) * 2 * Math.PI;
      return {
        x: Math.sin(angle) * radius,
        y: -Math.cos(angle) * radius,
        width: 36,
        height: CHAIR_DEPTH,
        rotation: (angle * 180) / Math.PI,
      };
    });
  }

  const upright = height > width;
  const side = upright ? height : width;
  const offset = (upright ? width : height) / 2 + CHAIR_GAP + CHAIR_DEPTH / 2;
  const perSide = [Math.ceil(capacity / 2), Math.floor(capacity / 2)];
  return perSide.flatMap((count, sideIndex) => {
    const length = Math.min(CHAIR_MAX_LENGTH, side / count - 12);
    const across = sideIndex === 0 ? -offset : offset;
    return Array.from({ length: count }, (_, index) => {
      const along = ((index + 0.5) / count) * side - side / 2;
      return upright
        ? { x: across, y: along, width: CHAIR_DEPTH, height: length, rotation: 0 }
        : { x: along, y: across, width: length, height: CHAIR_DEPTH, rotation: 0 };
    });
  });
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
          // The edge of the terrace: a pale floor inside a thin gold parapet.
          return (
            <rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              rx={16}
              fill="#fffdf8"
              stroke="#a8843f"
              strokeWidth={4}
            />
          );
        }
        if (shape.type === "polyline") {
          return (
            <polyline
              key={index}
              points={shape.points.map((point) => point.join(",")).join(" ")}
              fill="none"
              stroke="#cdbfa5"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        const view = shape.style === "view";
        return (
          <text
            key={index}
            textAnchor="middle"
            fontSize={view ? 23 : 21}
            fontWeight={view ? 500 : 400}
            letterSpacing={view ? 5 : 4}
            fill={view ? "#76581c" : "#8a7f6d"}
            transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation ?? 0})`}
            style={{ textTransform: "uppercase" }}
          >
            {areaLabels[shape.key] ?? shape.key}
          </text>
        );
      })}

      {tables.map((table) => {
        const selected = selectedIds.includes(table.id);
        const interactive = Boolean(onSelect && table.selectable);
        const outline = { stroke: selected ? INK : "none", strokeWidth: selected ? 9 : 0 };
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
            // Tables that can be picked stand slightly off the floor.
            style={interactive ? { filter: "drop-shadow(0 4px 4px rgb(30 27 23 / 0.22))" } : undefined}
            className={interactive ? "cursor-pointer outline-none focus-visible:[&>.tabletop]:stroke-[#1e1b17] focus-visible:[&>.tabletop]:[stroke-width:9]" : undefined}
          >
            {chairsFor(table).map((chair, index) => (
              <rect
                key={index}
                x={-chair.width / 2}
                y={-chair.height / 2}
                width={chair.width}
                height={chair.height}
                rx={6}
                fill={selected ? INK : table.color}
                opacity={selected ? 0.85 : 0.5}
                transform={`translate(${chair.x} ${chair.y}) rotate(${chair.rotation})`}
              />
            ))}
            {table.shape === "ROUND" ? (
              <ellipse className="tabletop" rx={table.width / 2} ry={table.height / 2} fill={table.color} {...outline} />
            ) : (
              <rect
                className="tabletop"
                x={-table.width / 2}
                y={-table.height / 2}
                width={table.width}
                height={table.height}
                rx={14}
                fill={table.color}
                {...outline}
              />
            )}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={32}
              fontWeight={600}
              fill={table.numberColor ?? "#ffffff"}
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
