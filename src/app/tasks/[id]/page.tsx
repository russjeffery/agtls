import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, task } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeTask } from "@/lib/api/serialize";
import { fmtDate, fmtDateTime, toDatetimeLocal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ResourceShell } from "@/components/resource/resource-shell";
import { FieldList } from "@/components/resource/field-list";
import { JsonCard } from "@/components/resource/json-card";
import { DeleteButton } from "@/components/resource/delete-button";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Task — agtls" };

const PRIORITY_BADGE: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

type Params = { params: Promise<{ id: string }> };

export default async function TaskDetailPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getPageViewer();
  if (!viewer) redirect("/sign-in");

  const [row] = await db.select().from(task).where(eq(task.id, id)).limit(1);
  if (!row) notFound();
  const owned = row.organizationId === null || viewer.organizationIds.includes(row.organizationId);
  if (!owned) notFound();

  const t = serializeTask(row);

  const editFields: FormField[] = [
    { name: "name", label: "Name", required: true, defaultValue: t.name },
    { name: "description", label: "Description", type: "textarea", defaultValue: t.description ?? "" },
    {
      name: "priority",
      label: "Priority",
      type: "select",
      required: true,
      defaultValue: t.priority,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "critical", label: "Critical" },
      ],
    },
    { name: "due_at", label: "Due date", type: "datetime", defaultValue: toDatetimeLocal(t.due_at) },
    { name: "labels", label: "Labels", type: "list", defaultValue: t.labels },
  ];

  return (
    <ResourceShell
      user={{ name: viewer.user.name, email: viewer.user.email }}
      breadcrumb={[{ label: "Tasks", href: "/tasks" }, { label: t.id }]}
      title={t.name}
      objectType="task"
    >
      <div className="mb-6 flex flex-col gap-4">
        <FieldList
          fields={[
            { label: "ID", value: t.id, mono: true },
            { label: "Priority", value: <Badge variant={PRIORITY_BADGE[t.priority]}>{t.priority}</Badge> },
            { label: "Description", value: t.description },
            {
              label: "Labels",
              value: t.labels.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {t.labels.map((l) => (
                    <Badge key={l} variant="outline">{l}</Badge>
                  ))}
                </span>
              ) : null,
            },
            { label: "Due", value: t.due_at ? fmtDate(t.due_at) : null, mono: true },
            { label: "Created", value: fmtDateTime(t.created_at), mono: true },
            { label: "Updated", value: fmtDateTime(t.updated_at), mono: true },
          ]}
        />

        <div className="flex items-center gap-2.5">
          <ResourceForm
            collapsible
            toggleLabel="Edit"
            title="Edit task"
            method="PATCH"
            endpoint={`/api/tasks/${t.id}`}
            submitLabel="Save changes"
            redirectTo={`/tasks/${t.id}`}
            fields={editFields}
          />
          <DeleteButton
            endpoint={`/api/tasks/${t.id}`}
            confirmMessage={`Delete task ${t.id}? This permanently deletes all data for this task.`}
            redirectTo="/tasks"
          />
        </div>

        <JsonCard data={t} />
      </div>
    </ResourceShell>
  );
}
