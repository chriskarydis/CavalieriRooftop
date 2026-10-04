"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { PriceBreakdown } from "@/domain/pricing";
import { FloorPlan, type FloorPlanTable } from "@/ui/floor-plan/FloorPlan";
import type { FloorPlanView } from "@/ui/floor-plan/types";
import { startHold } from "./actions";
import { PriceSummary } from "./PriceSummary";

export type PickerState = "AVAILABLE" | "HELD" | "TAKEN" | "NOT_SUITABLE";

export interface PickerTable {
  tableId: string;
  state: PickerState;
  price: PriceBreakdown | null;
  categoryName: string;
  viewDescription: string;
}

export interface PickerGroup {
  combinationIds: string[];
  tableIds: string[];
  tableNumbers: number[];
  capacity: number;
  price: PriceBreakdown;
}

const STATE_COLOR: Record<Exclude<PickerState, "AVAILABLE">, string> = {
  HELD: "#e58a1f",
  TAKEN: "#c9ced2",
  NOT_SUITABLE: "#dfe3e6",
};

type Choice = { kind: "TABLE"; tableId: string } | { kind: "GROUP"; index: number } | null;

/**
 * Step 2 of booking: the guest picks a table on the floor plan (or from the
 * equivalent list) and sees exactly what it costs before holding it.
 * Availability and prices come from the server; nothing is computed here.
 */
export function TablePicker({
  plan,
  tables,
  groups,
  slot,
  locale,
  areaLabels,
}: {
  plan: FloorPlanView;
  tables: PickerTable[];
  groups: PickerGroup[];
  slot: { date: string; time: string; guests: number };
  locale: string;
  areaLabels: Record<string, string>;
}) {
  const t = useTranslations("reserve");
  const format = useFormatter();
  const [choice, setChoice] = useState<Choice>(null);
  const panel = useRef<HTMLElement>(null);

  // On a phone the price panel sits below the tall floor plan, so bring it into view.
  const choose = (next: Choice) => {
    setChoice(next);
    requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const info = new Map(tables.map((table) => [table.tableId, table]));
  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const planTables: FloorPlanTable[] = plan.tables
    .filter((table) => info.has(table.id))
    .map((table) => {
      const entry = info.get(table.id)!;
      const available = entry.state === "AVAILABLE";
      return {
        ...table,
        color: available ? table.color : STATE_COLOR[entry.state as Exclude<PickerState, "AVAILABLE">],
        muted: false,
        selectable: available,
        label: t("tableAria", {
          number: table.number,
          capacity: table.capacity,
          category: entry.categoryName,
          state: t(`state.${entry.state}`),
        }),
      };
    });

  const selectedGroup = choice?.kind === "GROUP" ? groups[choice.index] : null;
  const selectedTable = choice?.kind === "TABLE" ? info.get(choice.tableId) : null;
  const selectedPlanTable = choice?.kind === "TABLE" ? plan.tables.find((table) => table.id === choice.tableId) : null;
  const selectedIds = selectedGroup ? selectedGroup.tableIds : choice?.kind === "TABLE" ? [choice.tableId] : [];
  const price = selectedGroup?.price ?? selectedTable?.price ?? null;
  const available = planTables.filter((table) => table.selectable);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,26rem)_1fr]">
      <div>
        <FloorPlan
          plan={plan}
          tables={planTables}
          title={t("floorPlanTitle")}
          areaLabels={areaLabels}
          selectedIds={selectedIds}
          onSelect={(tableId) => choose({ kind: "TABLE", tableId })}
        />
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {plan.categories.map((category) => (
            <li key={category.id} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: category.color }} />
              {category.name[locale] ?? category.name.en}
              {category.extraFeeCents > 0 && ` +${euro(category.extraFeeCents)}`}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: STATE_COLOR.HELD }} />
            {t("state.HELD")}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: STATE_COLOR.TAKEN }} />
            {t("state.TAKEN")}
          </li>
        </ul>
      </div>

      <div className="space-y-5">
        {groups.length > 0 && (
          <fieldset>
            <legend className="mb-2 font-semibold">{t("groupsTitle")}</legend>
            <p className="mb-2 text-sm text-stone-600">{t("groupsNote")}</p>
            <div className="space-y-2">
              {groups.map((group, index) => (
                <label key={group.combinationIds.join()} className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 bg-white p-3 has-checked:border-stone-900">
                  <input
                    type="radio"
                    name="seating"
                    checked={choice?.kind === "GROUP" && choice.index === index}
                    onChange={() => choose({ kind: "GROUP", index })}
                  />
                  <span>
                    {t("groupLabel", { tables: group.tableNumbers.join(" + "), capacity: group.capacity })}
                    <span className="block text-sm text-stone-600">{euro(group.price.totalCents)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <details className="rounded-lg border border-stone-300 bg-white p-3">
          <summary className="cursor-pointer font-medium">{t("listTitle")}</summary>
          <div className="mt-3 space-y-1">
            {available.length === 0 && <p className="text-sm text-stone-600">{t("noTables")}</p>}
            {available.map((table) => (
              <label key={table.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-100">
                <input
                  type="radio"
                  name="seating"
                  checked={choice?.kind === "TABLE" && choice.tableId === table.id}
                  onChange={() => choose({ kind: "TABLE", tableId: table.id })}
                />
                <span className="flex-1">
                  {t("listRow", {
                    number: table.number,
                    capacity: table.capacity,
                    category: info.get(table.id)!.categoryName,
                  })}
                </span>
                <span className="tabular-nums">{euro(info.get(table.id)!.price!.totalCents)}</span>
              </label>
            ))}
          </div>
        </details>

        <section ref={panel} aria-live="polite" className="rounded-xl border border-stone-300 bg-white p-4">
          {!price ? (
            <p className="text-stone-600">{t("selectPrompt")}</p>
          ) : (
            <form action={startHold} className="space-y-3">
              <h3 className="text-lg font-semibold">
                {selectedGroup
                  ? t("groupLabel", { tables: selectedGroup.tableNumbers.join(" + "), capacity: selectedGroup.capacity })
                  : t("tableTitle", { number: selectedPlanTable?.number ?? 0 })}
              </h3>
              {selectedTable && selectedPlanTable && (
                <p className="text-sm text-stone-600">
                  {t("tableMeta", { capacity: selectedPlanTable.capacity, category: selectedTable.categoryName })}
                  {selectedTable.viewDescription && ` · ${selectedTable.viewDescription}`}
                </p>
              )}
              <PriceSummary price={price} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="date" value={slot.date} />
              <input type="hidden" name="time" value={slot.time} />
              <input type="hidden" name="guests" value={slot.guests} />
              <input type="hidden" name="mode" value={selectedGroup ? "GROUP" : "TABLE"} />
              {selectedGroup ? (
                <input type="hidden" name="combinationIds" value={selectedGroup.combinationIds.join(",")} />
              ) : (
                <input type="hidden" name="tableId" value={choice?.kind === "TABLE" ? choice.tableId : ""} />
              )}
              <button type="submit" className="w-full rounded-md bg-stone-900 px-4 py-3 font-medium text-white">
                {t("holdButton")}
              </button>
              <p className="text-xs text-stone-600">{t("holdNote")}</p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
