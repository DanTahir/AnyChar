import { NextResponse } from "next/server";

function authErrorStatus(msg: string): number | null {
  if (msg === "Unauthorized") return 401;
  if (msg === "Forbidden" || msg === "Not approved") return 403;
  return null;
}

/**
 * JSON error response for Bitcoin routes. Auth errors map to 401/403. For other
 * errors, `exposeDetails` controls whether the raw message reaches the client
 * (admin routes: yes; user routes: only for 4xx).
 */
export function btcErrorResponse(e: unknown, fallbackStatus: number, exposeDetails: boolean) {
  const msg = e instanceof Error ? e.message : "Error";
  const status = authErrorStatus(msg) ?? fallbackStatus;
  if (status >= 500) console.error("[btc] route error:", e);
  const error =
    status < 500 || exposeDetails ? msg : "Bitcoin service is temporarily unavailable. Please try again shortly.";
  return NextResponse.json({ error }, { status });
}

export function btcDisabledResponse() {
  return NextResponse.json({ error: "Bitcoin deposits are not enabled" }, { status: 404 });
}
