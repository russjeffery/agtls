import type { Metadata } from "next";
import { inArray, desc } from "drizzle-orm";
import { db, webhookEndpoint } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeWebhookEndpoint } from "@/lib/api/serialize";
import { fmtDate } from "@/lib/format";
import { ResourceShell } from "@/components/resource/resource-shell";
import { ResourceTable } from "@/components/resource/resource-table";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Webhooks — agtls" };

const createFields: FormField[] = [
  { name: "name", label: "Name", placeholder: "Stripe events", required: true },
  { name: "description", label: "Description", type: "textarea", placeholder: "What this endpoint captures…" },
  { name: "max_events", label: "Max events", type: "number", placeholder: "Defaults to 100" },
];

export default async function WebhooksPage() {
  const viewer = await getPageViewer();

  const rows = viewer?.organizationIds.length
    ? await db
        .select()
        .from(webhookEndpoint)
        .where(inArray(webhookEndpoint.organizationId, viewer.organizationIds))
        .orderBy(desc(webhookEndpoint.createdAt))
        .limit(100)
    : [];
  const data = rows.map((r) => serializeWebhookEndpoint(r));

  return (
    <ResourceShell
      user={viewer ? { name: viewer.user.name, email: viewer.user.email } : null}
      breadcrumb={[{ label: "Webhooks", href: "/webhooks" }]}
      title="Webhooks"
      description="Webhook endpoints you can POST to. Each endpoint captures every inbound request."
    >
      <div className="mb-6">
        <ResourceForm
          collapsible
          title="New webhook endpoint"
          endpoint="/api/webhooks"
          submitLabel="Create endpoint"
          fields={createFields}
        />
      </div>

      <ResourceTable
        columns={[
          { key: "id", label: "ID", mono: true },
          { key: "name", label: "Name" },
          { key: "max_events", label: "Max events", mono: true },
          { key: "created", label: "Created", mono: true },
        ]}
        rows={data.map((w) => ({
          id: w.id,
          name: w.name,
          max_events: w.max_events,
          created: fmtDate(w.created_at),
          href: `/webhooks/${w.id}`,
        }))}
        emptyMessage={
          viewer
            ? "No webhook endpoints yet. Create one above."
            : "Sign in to see your organization's webhook endpoints. Endpoints created without signing in are public to anyone with the ID."
        }
      />
    </ResourceShell>
  );
}
