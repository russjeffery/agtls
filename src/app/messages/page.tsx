import type { Metadata } from "next";
import { inArray, desc } from "drizzle-orm";
import { db, scheduledMessage } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeScheduledMessage } from "@/lib/api/serialize";
import { fmtDateTime } from "@/lib/format";
import { ResourceShell } from "@/components/resource/resource-shell";
import { ResourceTable } from "@/components/resource/resource-table";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Messages — agtls" };

const STATUS_BADGE: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  scheduled: "default",
  delivering: "outline",
  delivered: "secondary",
  failed: "destructive",
  canceled: "outline",
};

const createFields: FormField[] = [
  { name: "url", label: "Target URL", placeholder: "https://example.com/agent/wake", required: true },
  { name: "method", label: "HTTP method", placeholder: "POST" },
  { name: "body", label: "Request body", type: "textarea", placeholder: '{ "event": "wake" }' },
  { name: "delay_seconds", label: "Delay (seconds from now)", type: "number", placeholder: "4500", required: true },
];

export default async function MessagesPage() {
  const viewer = await getPageViewer();

  const rows = viewer?.organizationIds.length
    ? await db
      .select()
      .from(scheduledMessage)
      .where(inArray(scheduledMessage.organizationId, viewer.organizationIds))
      .orderBy(desc(scheduledMessage.createdAt))
      .limit(100)
    : [];
  const data = rows.map(serializeScheduledMessage);

  return (
    <ResourceShell
      user={viewer ? { name: viewer.user.name, email: viewer.user.email } : null}
      breadcrumb={[{ label: "Messages", href: "/messages" }]}
      title="Messages"
      description="Scheduled messages — fire an HTTP request to a URL at a later time to trigger an agent."
    >
      <div className="mb-6">
        <ResourceForm
          collapsible
          title="Schedule a message"
          endpoint="/api/messages"
          submitLabel="Schedule"
          fields={createFields}
        />
      </div>

      <ResourceTable
        columns={[
          { key: "id", label: "ID", mono: true },
          { key: "url", label: "Target", mono: true },
          { key: "status", label: "Status", badge: STATUS_BADGE },
          { key: "scheduled", label: "Scheduled", mono: true },
        ]}
        rows={data.map((m) => ({
          id: m.id,
          url: m.url,
          status: m.status,
          scheduled: fmtDateTime(m.scheduled_at),
          href: `/messages/${m.id}`,
        }))}
        emptyMessage={
          viewer
            ? "No scheduled messages yet. Schedule one above."
            : "Sign in to see your organization's messages. Messages scheduled without signing in are public to anyone with the ID."
        }
      />
    </ResourceShell>
  );
}
