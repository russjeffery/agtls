import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { inArray, desc } from "drizzle-orm";
import { db, task } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeTask } from "@/lib/api/serialize";
import { fmtDate } from "@/lib/format";
import { ResourceShell } from "@/components/resource/resource-shell";
import { ResourceTable } from "@/components/resource/resource-table";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Tasks — agtls" };

const PRIORITY_BADGE: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

const createFields: FormField[] = [
  { name: "name", label: "Name", placeholder: "Ship the onboarding flow", required: true },
  { name: "description", label: "Description", type: "textarea", placeholder: "What this task is for…" },
  {
    name: "priority",
    label: "Priority",
    type: "select",
    placeholder: "low (default)",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "critical", label: "Critical" },
    ],
  },
  { name: "due_at", label: "Due date", type: "datetime" },
  { name: "labels", label: "Labels", type: "list", placeholder: "Type a label and press Enter" },
];

export default async function TasksPage() {
  const viewer = await getPageViewer();
  if (!viewer) redirect("/sign-in");

  const rows = viewer.organizationIds.length
    ? await db
        .select()
        .from(task)
        .where(inArray(task.organizationId, viewer.organizationIds))
        .orderBy(desc(task.createdAt))
        .limit(100)
    : [];
  const data = rows.map(serializeTask);

  return (
    <ResourceShell
      user={{ name: viewer.user.name, email: viewer.user.email }}
      breadcrumb={[{ label: "Tasks", href: "/tasks" }]}
      title="Tasks"
      description="Units of work with a priority, an optional due date, and labels for flexible grouping."
    >
      <div className="mb-6">
        <ResourceForm
          collapsible
          title="New task"
          endpoint="/api/tasks"
          submitLabel="Create task"
          fields={createFields}
        />
      </div>

      <ResourceTable
        columns={[
          { key: "id", label: "ID", mono: true },
          { key: "name", label: "Name" },
          { key: "priority", label: "Priority", badge: PRIORITY_BADGE },
          { key: "created", label: "Created", mono: true },
        ]}
        rows={data.map((t) => ({
          id: t.id,
          name: t.name,
          priority: t.priority,
          created: fmtDate(t.created_at),
          href: `/tasks/${t.id}`,
        }))}
        emptyMessage="No tasks yet. Create one above."
      />
    </ResourceShell>
  );
}
