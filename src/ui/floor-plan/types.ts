import type { FloorShape } from "@/server/db/schema";

export interface FloorTableView {
  id: string;
  number: number;
  capacity: number;
  maxCapacity: number;
  isSpare: boolean;
  categoryId: string;
  viewDescription: Record<string, string> | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: "RECT" | "ROUND";
  color: string;
  /** Drawn faded: inactive or out of service. */
  muted: boolean;
}

export interface FloorCategoryView {
  id: string;
  name: Record<string, string>;
  extraFeeCents: number;
  color: string;
}

export interface FloorPlanView {
  width: number;
  height: number;
  shapes: FloorShape[];
  tables: FloorTableView[];
  categories: FloorCategoryView[];
}
