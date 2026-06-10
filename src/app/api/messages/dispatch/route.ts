import { NextRequest } from "next/server";
import { ok, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { dispatchDueMessages } from "@/lib/messages/dispatch";

// Delivers every scheduled message whose time has come. There is no background
// worker in a serverless deployment, so an external scheduler must call this on
// an interval (e.g. a Vercel Cron or system cron POSTing here every minute).
//
// If CRON_SECRET is set, the caller must present it as `Authorization: Bearer
// <secret>` (the scheme Vercel Cron uses). If it's unset, the endpoint is open —
// fine for local dev, but set CRON_SECRET in any deployment.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return errorResponse(
        errors.unauthorized("Invalid or missing cron secret."),
        401
      );
    }
  }

  const summary = await dispatchDueMessages();
  return ok({ object: "dispatch_result", ...summary });
}
