import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { addCombination, addPairing, saveCombination, togglePairing } from "../config-actions";
import { cardClass, inputClass, Notice, primaryButton, secondaryButton } from "../ui";

export default async function CombinationsPage({ searchParams }: PageProps<"/manage/combinations">) {
  await requirePermission("configuration");
  const t = await getTranslations("config");
  const query = await searchParams;
  const [tables, combinations, members, pairings] = await Promise.all([
    db.select().from(schema.diningTable).orderBy(asc(schema.diningTable.number)),
    db.select().from(schema.tableCombination).orderBy(asc(schema.tableCombination.createdAt)),
    db.select().from(schema.tableCombinationMember),
    db.select().from(schema.combinationPairing),
  ]);
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const label = (combinationId: string): string =>
    members
      .filter((member) => member.combinationId === combinationId)
      .map((member) => tableById.get(member.tableId))
      .map((table) => (table?.isSpare ? t("tables.spare") : String(table?.number)))
      .join(" + ");
  const small = "w-20 rounded border border-stone-300 px-2 py-1";

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">{t("combinations.title")}</h1>
        <p className="text-sm text-slate-600">{t("combinations.intro")}</p>
      </header>
      <Notice query={query} />

      <section className={cardClass}>
        <ul className="divide-y divide-slate-100">
          {combinations.map((combination) => (
            <li key={combination.id} className="py-3">
              <form action={saveCombination.bind(null, combination.id)} className="flex flex-wrap items-end gap-3 text-sm">
                <span className="w-32 pb-1.5 font-semibold">{label(combination.id)}</span>
                <label>
                  {t("combinations.capacity")}
                  <input name="capacity" type="number" min={2} max={40} required defaultValue={combination.capacity} className={`block ${small}`} />
                </label>
                <label>
                  {t("combinations.minParty")}
                  <input name="minParty" type="number" min={1} max={40} required defaultValue={combination.minParty} className={`block ${small}`} />
                </label>
                <label>
                  {t("tables.priority")}
                  <input name="priority" type="number" min={-100} max={100} required defaultValue={combination.priority} className={`block ${small}`} />
                </label>
                <label className="flex items-center gap-1.5 pb-1.5">
                  <input name="active" type="checkbox" defaultChecked={combination.active} />
                  {t("combinations.active")}
                </label>
                <label className="flex items-center gap-1.5 pb-1.5">
                  <input name="onlineBookable" type="checkbox" defaultChecked={combination.onlineBookable} />
                  {t("combinations.online")}
                </label>
                <button type="submit" className={secondaryButton}>
                  {t("save")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className={cardClass}>
        <h2 className="mb-1 font-semibold">{t("combinations.new")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("combinations.newNote")}</p>
        <form action={addCombination} className="space-y-3 text-sm">
          <fieldset>
            <legend className="mb-1 font-medium">{t("combinations.tables")}</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {tables.map((table) => (
                <label key={table.id} className="flex items-center gap-1">
                  <input type="checkbox" name="tableIds" value={table.id} />
                  {table.isSpare ? t("tables.spare") : table.number}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <label className="font-medium">
              {t("combinations.capacity")}
              <input name="capacity" type="number" min={2} max={40} required className={`block ${small}`} />
            </label>
            <label className="font-medium">
              {t("combinations.minParty")}
              <input name="minParty" type="number" min={1} max={40} required className={`block ${small}`} />
            </label>
            <button type="submit" className={primaryButton}>
              {t("combinations.create")}
            </button>
          </div>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="mb-1 font-semibold">{t("pairings.title")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("pairings.intro")}</p>
        <ul className="mb-4 space-y-2 text-sm">
          {pairings.map((pairing) => (
            <li key={pairing.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={pairing.active ? "" : "text-slate-500 line-through"}>
                ({label(pairing.firstCombinationId)}) {t("pairings.with")} ({label(pairing.secondCombinationId)})
              </span>
              <form action={togglePairing.bind(null, pairing.id, !pairing.active)}>
                <button type="submit" className={secondaryButton}>
                  {pairing.active ? t("pairings.disable") : t("pairings.enable")}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addPairing} className="flex flex-wrap items-end gap-3 text-sm font-medium">
          {(["first", "second"] as const).map((name) => (
            <label key={name}>
              {t(`pairings.${name}`)}
              <select name={name} required className={inputClass}>
                {combinations.map((combination) => (
                  <option key={combination.id} value={combination.id}>
                    {label(combination.id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="submit" className={primaryButton}>
            {t("pairings.create")}
          </button>
        </form>
      </section>
    </main>
  );
}
