import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db, webhookEndpoint, webhookEvent } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeWebhookEvent } from "@/lib/api/serialize";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ResourceShell } from "@/components/resource/resource-shell";
import { FieldList } from "@/components/resource/field-list";
import { JsonCard } from "@/components/resource/json-card";
import { DeleteButton } from "@/components/resource/delete-button";

export const metadata: Metadata = { title: "Webhook event — agtls" };

const METHOD_BADGE: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  GET: "secondary",
  POST: "default",
  PUT: "outline",
  PATCH: "outline",
  DELETE: "destructive",
};

type Params = { params: Promise<{ id: string; eventId: string }> };

export default async function WebhookEventPage({ params }: Params) {
  const { id, eventId } = await params;
  const viewer = await getPageViewer();

  const [endpoint] = await db.select().from(webhookEndpoint).where(eq(webhookEndpoint.id, id)).limit(1);
  if (!endpoint) notFound();
  if (endpoint.organizationId !== null) {
    if (!viewer) redirect("/sign-in");
    if (!viewer.organizationIds.includes(endpoint.organizationId)) notFound();
  }

  const [row] = await db
    .select()
    .from(webhookEvent)
    .where(and(eq(webhookEvent.id, eventId), eq(webhookEvent.endpointId, id)))
    .limit(1);
  if (!row) notFound();

  const e = serializeWebhookEvent(row);

  return (
    <ResourceShell
      user={viewer ? { name: viewer.user.name, email: viewer.user.email } : null}
      breadcrumb={[
        { label: "Webhooks", href: "/webhooks" },
        { label: id, href: `/webhooks/${id}` },
        { label: "events" },
        { label: e.id },
      ]}
      title={e.id}
      objectType="webhook_event"
    >
      <div className="mb-6 flex flex-col gap-4">
        <FieldList
          fields={[
            { label: "Method", value: <Badge variant={METHOD_BADGE[e.method] ?? "outline"}>{e.method}</Badge> },
            { label: "Path", value: e.path, mono: true },
            { label: "Source IP", value: e.source_ip, mono: true },
            { label: "Size", value: e.size_bytes != null ? `${e.size_bytes} bytes` : null, mono: true },
            { label: "Received", value: fmtDateTime(e.received_at), mono: true },
          ]}
        />

        <DeleteButton
          endpoint={`/api/webhooks/${id}/events/${e.id}`}
          confirmMessage={`Delete event ${e.id}?`}
          redirectTo={`/webhooks/${id}`}
        />

        <JsonCard data={e} />
      </div>
    </ResourceShell>
  );
}
