import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scheduledMessage } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeScheduledMessage } from "@/lib/api/serialize";
import { fmtDateTime, toDatetimeLocal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ResourceShell } from "@/components/resource/resource-shell";
import { FieldList } from "@/components/resource/field-list";
import { JsonCard } from "@/components/resource/json-card";
import { DeleteButton } from "@/components/resource/delete-button";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Message — agtls" };

const STATUS_BADGE: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  scheduled: "default",
  delivering: "outline",
  delivered: "secondary",
  failed: "destructive",
  canceled: "outline",
};

type Params = { params: Promise<{ id: string }> };

export default async function MessageDetailPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getPageViewer();

  const [row] = await db.select().from(scheduledMessage).where(eq(scheduledMessage.id, id)).limit(1);
  if (!row) notFound();
  if (row.organizationId !== null) {
    if (!viewer) redirect("/sign-in");
    if (!viewer.organizationIds.includes(row.organizationId)) notFound();
  }

  const m = serializeScheduledMessage(row);
  const editable = m.status === "scheduled";

  const editFields: FormField[] = [
    { name: "url", label: "Target URL", required: true, defaultValue: m.url },
    { name: "method", label: "HTTP method", defaultValue: m.method },
    { name: "body", label: "Request body", type: "textarea", defaultValue: m.body ?? "" },
    { name: "scheduled_at", label: "Scheduled for", type: "datetime", defaultValue: toDatetimeLocal(m.scheduled_at) },
  ];

  return (
    <ResourceShell
      user={viewer ? { name: viewer.user.name, email: viewer.user.email } : null}
      breadcrumb={[{ label: "Messages", href: "/messages" }, { label: m.id }]}
      title={m.id}
      objectType="scheduled_message"
    >
      <div className="mb-6 flex flex-col gap-4">
        <FieldList
          fields={[
            { label: "Status", value: <Badge variant={STATUS_BADGE[m.status]}>{m.status}</Badge> },
            { label: "Target", value: m.url, mono: true },
            { label: "Method", value: m.method, mono: true },
            { label: "Scheduled", value: fmtDateTime(m.scheduled_at), mono: true },
            { label: "Attempts", value: String(m.attempts), mono: true },
            { label: "Response", value: m.response_status != null ? String(m.response_status) : null, mono: true },
            { label: "Last error", value: m.last_error, mono: true },
            { label: "Delivered", value: m.delivered_at ? fmtDateTime(m.delivered_at) : null, mono: true },
            { label: "Created", value: fmtDateTime(m.created_at), mono: true },
          ]}
        />

        <div className="flex items-center gap-2.5">
          {editable && (
            <ResourceForm
              collapsible
              toggleLabel="Edit"
              title="Edit message"
              method="PATCH"
              endpoint={`/api/messages/${m.id}`}
              submitLabel="Save changes"
              redirectTo={`/messages/${m.id}`}
              fields={editFields}
            />
          )}
          <DeleteButton
            endpoint={`/api/messages/${m.id}`}
            confirmMessage={`Cancel and delete message ${m.id}? If it hasn't fired yet, it never will.`}
            redirectTo="/messages"
            label="Cancel & delete"
          />
        </div>

        <JsonCard data={m} />
      </div>
    </ResourceShell>
  );
}
