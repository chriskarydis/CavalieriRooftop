import type { FloorPlanView } from "./types";

/**
 * Data-driven SVG floor plan. Purely presentational: it draws the tables and
 * static shapes it is given and decides nothing about availability or price.
 * Coordinates are in the plan's own unit space, so the drawing scales to any
 * container through the viewBox.
 */
export function FloorPlan({
  plan,
  title,
  areaLabel,
  tableLabel,
}: {
  plan: FloorPlanView;
  title: string;
  areaLabel: (key: string) => string;
  tableLabel: (table: FloorPlanView["tables"][number]) => string;
}) {
  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      role="group"
      aria-label={title}
      className="h-auto w-full"
    >
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
            {areaLabel(shape.key)}
          </text>
        );
      })}

      {plan.tables.map((table) => (
        <g
          key={table.id}
          role="img"
          aria-label={tableLabel(table)}
          transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}
          opacity={table.muted ? 0.35 : 1}
        >
          {table.shape === "ROUND" ? (
            <ellipse rx={table.width / 2} ry={table.height / 2} fill={table.color} />
          ) : (
            <rect
              x={-table.width / 2}
              y={-table.height / 2}
              width={table.width}
              height={table.height}
              rx={22}
              fill={table.color}
            />
          )}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={30}
            fontWeight={700}
            fill="#ffffff"
            transform={`rotate(${-table.rotation})`}
          >
            {table.isSpare ? "S" : table.number}
          </text>
        </g>
      ))}
    </svg>
  );
}
