/**
 * Error reporting. Every server error is written to the log as one JSON line
 * (the host keeps and searches these), and, when ALERT_EMAIL is set, emailed
 * to the developer. No guest data is included: only where it failed and why.
 */

export interface ErrorReport {
  message: string;
  /** Short code Next.js also shows to the user, linking their screen to this log line. */
  digest?: string;
  path: string;
  method: string;
  /** Which part of the application failed, e.g. "render", "route", "action". */
  kind: string;
  stack?: string;
}

const ALERT_INTERVAL_MS = 15 * 60 * 1000;
const MAX_STACK_LINES = 12;

/** Last alert time per error message, so a failing page does not send an email per request. */
const lastAlert = new Map<string, number>();

/** Secret tokens appear in two addresses; they must never reach a log or an inbox. */
export function redactPath(path: string): string {
  return path.replace(/\/(reserve|reservation)\/[^/?#]+/g, "/$1/[token]").replace(/\?.*$/, "");
}

/**
 * A failed database query reports the values it was run with, which can be a
 * guest's name, email or phone. The query text is kept; the values are dropped.
 */
function withoutQueryValues(text: string): string {
  return text.replace(/\nparams:[^\n]*/g, "\nparams: [removed]");
}

export function describeError(error: unknown): { message: string; digest?: string; stack?: string } {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  if (error instanceof Error) {
    return {
      message: withoutQueryValues(error.message),
      digest,
      stack: error.stack ? withoutQueryValues(error.stack).split("\n").slice(0, MAX_STACK_LINES).join("\n") : undefined,
    };
  }
  return { message: withoutQueryValues(String(error)), digest };
}

export function shouldAlert(message: string, now: number): boolean {
  const previous = lastAlert.get(message);
  if (previous !== undefined && now - previous < ALERT_INTERVAL_MS) return false;
  lastAlert.set(message, now);
  return true;
}

export async function reportError(report: ErrorReport, now = Date.now()): Promise<void> {
  console.error(JSON.stringify({ level: "error", time: new Date(now).toISOString(), ...report }));

  const recipient = process.env.ALERT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!recipient || !apiKey || !from || !shouldAlert(report.message, now)) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `[Cavalieri] Error: ${report.message.slice(0, 80)}`,
        text: [
          `What: ${report.message}`,
          `Where: ${report.method} ${report.path} (${report.kind})`,
          report.digest ? `Code shown to the user: ${report.digest}` : "",
          "",
          report.stack ?? "",
          "",
          "Further alerts for this same error are held back for 15 minutes.",
        ].join("\n"),
      }),
    });
  } catch {
    // Reporting must never cause a second failure.
  }
}
