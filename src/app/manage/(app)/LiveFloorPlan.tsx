"use client";

import { useRouter } from "next/navigation";
import { FloorPlan, type FloorPlanTable } from "@/ui/floor-plan/FloorPlan";
import type { FloorPlanView } from "@/ui/floor-plan/types";

/** The manager's floor plan: every table can be opened for its details. */
export function LiveFloorPlan({
  plan,
  tables,
  title,
  areaLabels,
  selectedId,
}: {
  plan: Pick<FloorPlanView, "width" | "height" | "shapes">;
  tables: FloorPlanTable[];
  title: string;
  areaLabels: Record<string, string>;
  selectedId: string | null;
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
    />
  );
}
