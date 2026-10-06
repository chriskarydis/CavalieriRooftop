import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, redactPath, reportError, shouldAlert } from "./monitoring";

describe("error reporting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never lets a guest's secret link reach a log", () => {
    expect(redactPath("/en/reservation/AbC-123_secret")).toBe("/en/reservation/[token]");
    expect(redactPath("/el/reserve/AbC-123_secret?redirect_status=succeeded")).toBe("/el/reserve/[token]");
    expect(redactPath("/en/reserve?date=2027-08-12")).toBe("/en/reserve");
    expect(redactPath("/manage/reservations?q=maria")).toBe("/manage/reservations");
  });

  it("describes errors, keeping the code the user was shown", () => {
    const error = Object.assign(new Error("Database is unreachable"), { digest: "1234567" });
    expect(describeError(error)).toMatchObject({ message: "Database is unreachable", digest: "1234567" });
    expect(describeError("plain text")).toEqual({ message: "plain text", digest: undefined });
  });

  it("drops the values of a failed database query, which may be guest details", () => {
    const error = new Error('Failed query: select * from "customer" where "email" = $1\nparams: maria@example.com,+30 690 000 0000');
    const described = describeError(error);
    expect(described.message).toContain('where "email" = $1');
    expect(described.message).not.toContain("maria@example.com");
    expect(described.stack).not.toContain("690 000");
  });

  it("holds back repeat alerts for the same error for 15 minutes", () => {
    const start = 1_000_000;
    expect(shouldAlert("boom A", start)).toBe(true);
    expect(shouldAlert("boom A", start + 60_000)).toBe(false);
    expect(shouldAlert("boom B", start + 60_000)).toBe(true);
    expect(shouldAlert("boom A", start + 16 * 60_000)).toBe(true);
  });

  it("logs one JSON line and emails the developer when an address is configured", async () => {
    vi.stubEnv("ALERT_EMAIL", "dev@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Site <site@example.com>");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", send);

    const report = { message: "boom C", path: "/en/menu", method: "GET", kind: "render", digest: "42" };
    await reportError(report, 5_000_000);
    await reportError(report, 5_000_000 + 1000);

    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ level: "error", message: "boom C", path: "/en/menu" });
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse(send.mock.calls[0][1].body as string);
    expect(body.to).toEqual(["dev@example.com"]);
    expect(body.text).toContain("GET /en/menu (render)");
  });

  it("only logs when no alert address is set, and survives a failing email provider", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", send);
    vi.stubEnv("ALERT_EMAIL", "");

    await reportError({ message: "boom D", path: "/", method: "GET", kind: "render" });
    expect(send).not.toHaveBeenCalled();

    vi.stubEnv("ALERT_EMAIL", "dev@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Site <site@example.com>");
    await expect(reportError({ message: "boom E", path: "/", method: "GET", kind: "render" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
  });
});
