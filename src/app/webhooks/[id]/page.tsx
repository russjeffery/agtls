import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq, count, desc } from "drizzle-orm";
import { db, webhookEndpoint, webhookEvent } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeWebhookEndpoint, serializeWebhookEvent } from "@/lib/api/serialize";
import { fmtDateTime } from "@/lib/format";
import { ResourceShell } from "@/components/resource/resource-shell";
import { ResourceTable } from "@/components/resource/resource-table";
import { FieldList } from "@/components/resource/field-list";
import { JsonCard } from "@/components/resource/json-card";
import { DeleteButton } from "@/components/resource/delete-button";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Webhook endpoint — agtls" };

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

const METHOD_BADGE: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  GET: "secondary",
  POST: "default",
  PUT: "outline",
  PATCH: "outline",
  DELETE: "destructive",
};

type Params = { params: Promise<{ id: string }> };

export default async function WebhookDetailPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getPageViewer();
  if (!viewer) redirect("/sign-in");

  const [row] = await db.select().from(webhookEndpoint).where(eq(webhookEndpoint.id, id)).limit(1);
  if (!row) notFound();
  const owned = row.organizationId === null || viewer.organizationIds.includes(row.organizationId);
  if (!owned) notFound();

  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(webhookEvent)
    .where(eq(webhookEvent.endpointId, id));

  const eventRows = await db
    .select()
    .from(webhookEvent)
    .where(eq(webhookEvent.endpointId, id))
    .orderBy(desc(webhookEvent.receivedAt))
    .limit(20);

  const w = serializeWebhookEndpoint(row, eventCount);
  const events = eventRows.map(serializeWebhookEvent);

  const editFields: FormField[] = [
    { name: "name", label: "Name", required: true, defaultValue: w.name },
    { name: "description", label: "Description", type: "textarea", defaultValue: w.description ?? "" },
    { name: "max_events", label: "Max events", type: "number", defaultValue: String(w.max_events) },
  ];

  return (
    <ResourceShell
      user={{ name: viewer.user.name, email: viewer.user.email }}
      breadcrumb={[{ label: "Webhooks", href: "/webhooks" }, { label: w.id }]}
      title={w.name}
      objectType="webhook_endpoint"
    >
      <div className="mb-6 flex flex-col gap-4">
        <FieldList
          fields={[
            { label: "ID", value: w.id, mono: true },
            { label: "Description", value: w.description },
            { label: "Catch URL", value: w.url, mono: true },
            { label: "Max events", value: String(w.max_events), mono: true },
            { label: "Events", value: String(eventCount), mono: true },
            { label: "Created", value: fmtDateTime(w.created_at), mono: true },
          ]}
        />

        <div>
          <div
            className="mb-2 uppercase"
            style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", fontWeight: 600, color: "var(--text-faint)" }}
          >
            Recent events
          </div>
          <ResourceTable
            columns={[
              { key: "id", label: "ID", mono: true },
              { key: "method", label: "Method", badge: METHOD_BADGE },
              { key: "path", label: "Path", mono: true },
              { key: "size", label: "Size", mono: true },
              { key: "received", label: "Received", mono: true },
            ]}
            rows={events.map((e) => ({
              id: e.id,
              method: e.method,
              path: e.path,
              size: e.size_bytes,
              received: fmtDateTime(e.received_at),
              href: `/webhooks/${w.id}/events/${e.id}`,
            }))}
            emptyMessage={`No events captured yet. POST to ${w.url} to capture one.`}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <ResourceForm
            collapsible
            toggleLabel="Edit"
            title="Edit endpoint"
            method="PATCH"
            endpoint={`/api/webhooks/${w.id}`}
            submitLabel="Save changes"
            redirectTo={`/webhooks/${w.id}`}
            fields={editFields}
          />
          <DeleteButton
            endpoint={`/api/webhooks/${w.id}`}
            confirmMessage={`Delete webhook endpoint ${w.id}? This permanently deletes the endpoint and every captured event.`}
            redirectTo="/webhooks"
          />
        </div>

        <JsonCard data={w} />
      </div>
    </ResourceShell>
  );
}
