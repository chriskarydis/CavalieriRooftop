import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ReservationStatus } from "@/domain/reservation-state";
import { cancelAction, completeAction, noShowAction, seatAction } from "../actions";
import { secondaryButton } from "./ui";

/** The buttons staff may press for a reservation in its current status. */
export async function ReservationActions({
  reservationId,
  status,
  returnTo,
  moveControl,
  extra,
}: {
  reservationId: string;
  status: ReservationStatus;
  returnTo: string;
  /** Takes the place of the link to the live floor's move preview. */
  moveControl?: ReactNode;
  /** Further controls for a reservation that has not arrived yet. */
  extra?: ReactNode;
}) {
  const t = await getTranslations("manage");
  const awaited = status === "CONFIRMED" || status === "LATE";

  return (
    <div className="flex flex-wrap gap-1.5">
      {(awaited || status === "NO_SHOW") && (
        <form action={seatAction.bind(null, reservationId, returnTo)}>
          <button className={secondaryButton}>{status === "NO_SHOW" ? t("seatAnyway") : t("actions.seat")}</button>
        </form>
      )}
      {status === "LATE" && (
        <form action={noShowAction.bind(null, reservationId, returnTo)}>
          <button className={secondaryButton}>{t("actions.noShow")}</button>
        </form>
      )}
      {status === "SEATED" && (
        <form action={completeAction.bind(null, reservationId, returnTo)}>
          <button className={secondaryButton}>{t("actions.complete")}</button>
        </form>
      )}
      {(awaited || status === "SEATED") &&
        (moveControl ?? (
          <Link href={`/manage?move=${reservationId}`} className={secondaryButton}>
            {t("actions.move")}
          </Link>
        ))}
      {awaited && extra}
      {awaited && (
        <details>
          <summary className={`${secondaryButton} cursor-pointer list-none text-red-800`}>{t("actions.cancel")}</summary>
          <form action={cancelAction.bind(null, reservationId, returnTo)} className="mt-1">
            <button className="rounded-md bg-red-700 px-2 py-1 text-sm text-white">{t("actions.confirmCancel")}</button>
          </form>
        </details>
      )}
    </div>
  );
}
