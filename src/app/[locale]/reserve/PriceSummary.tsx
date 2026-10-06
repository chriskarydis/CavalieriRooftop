import { useFormatter, useTranslations } from "next-intl";

export interface PriceSummaryData {
  partySize: number;
  depositPerPersonCents: number;
  billableSeats: number;
  billableBasis?: "PARTY_SIZE" | "MINIMUM_GUESTS" | "TABLE_CAPACITY";
  depositCents: number;
  tableFeeCents: number;
  totalCents: number;
  creditTowardBillCents: number;
}

/**
 * The price breakdown exactly as the server calculated it. Explains why the
 * minimum spend is what it is, so there is no surprise at payment.
 */
export function PriceSummary({ price }: { price: PriceSummaryData }) {
  const t = useTranslations("price");
  const format = useFormatter();
  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

  return (
    <div className="space-y-2 text-sm">
      <dl className="space-y-1">
        <div className="flex justify-between gap-4">
          <dt>
            {t("deposit")}
            <span className="block text-xs text-muted">
              {t("depositDetail", { seats: price.billableSeats, perPerson: euro(price.depositPerPersonCents) })}
            </span>
          </dt>
          <dd className="tabular-nums">{euro(price.depositCents)}</dd>
        </div>
        {price.tableFeeCents > 0 && (
          <div className="flex justify-between gap-4">
            <dt>
              {t("tableFee")}
              <span className="block text-xs text-muted">{t("tableFeeDetail")}</span>
            </dt>
            <dd className="tabular-nums">{euro(price.tableFeeCents)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-semibold">
          <dt>{t("total")}</dt>
          <dd className="tabular-nums">{euro(price.totalCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-muted">
          <dt>{t("credit")}</dt>
          <dd className="tabular-nums">{euro(price.creditTowardBillCents)}</dd>
        </div>
      </dl>
      {price.billableBasis === "TABLE_CAPACITY" && (
        <p className="notice notice-warn">
          {t("capacityNote", { seats: price.billableSeats, guests: price.partySize, amount: euro(price.depositCents) })}
        </p>
      )}
      {price.billableBasis === "MINIMUM_GUESTS" && (
        <p className="notice notice-warn">
          {t("minimumGuestsNote", { seats: price.billableSeats, amount: euro(price.depositCents) })}
        </p>
      )}
    </div>
  );
}
