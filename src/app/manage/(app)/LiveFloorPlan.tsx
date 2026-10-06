"use client";

import { useRouter } from "next/navigation";
import { FloorPlan, type FloorPlanTable } from "@/ui/floor-plan/FloorPlan";
import type { FloorPlanView } from "@/ui/floor-plan/types";

/**
 * The manager's floor plan: every table can be opened for its details, and a
 * table with a reservation can be dragged onto another table to move the
 * reservation there. The drop only opens the usual preview; nothing moves
 * until the manager confirms it.
 */
export function LiveFloorPlan({
  plan,
  tables,
  title,
  areaLabels,
  selectedId,
  movable,
}: {
  plan: Pick<FloorPlanView, "width" | "height" | "shapes">;
  tables: FloorPlanTable[];
  title: string;
  areaLabels: Record<string, string>;
  selectedId: string | null;
  /** Table id to the reservation that would move if that table is dragged. */
  movable: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <FloorPlan
      plan={plan}
      tables={tables}
      title={title}
      areaLabels={areaLabels}
      selectedIds={selectedId ? [selectedId] : []}
      onSelect={(tableId) => router.push(`/manage?table=${tableId}`, { scroll: false })}
      draggableIds={Object.keys(movable)}
      onDrop={(from, to) => router.push(`/manage?move=${movable[from]}&to=${to}`, { scroll: false })}
    />
  );
}
