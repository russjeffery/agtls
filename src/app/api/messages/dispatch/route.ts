import { NextRequest } from "next/server";
import { ok, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { dispatchDueMessages } from "@/lib/messages/dispatch";

// Delivers every scheduled message whose time has come. There is no background
// worker in a serverless deployment, so a scheduler must call this on an
// interval — in production the Workers cron trigger (worker.ts) POSTs every
// minute; external schedulers may GET or POST — both run the same dispatcher.
//
// If CRON_SECRET is set, the caller must present it as `Authorization: Bearer
// <secret>` (the cron handler in worker.ts attaches this automatically when
// the env var exists). If it's unset, the endpoint is open — fine for local
// dev, but set CRON_SECRET in any deployment.

async function handleDispatch(request: NextRequest) {
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

export { handleDispatch as GET, handleDispatch as POST };
