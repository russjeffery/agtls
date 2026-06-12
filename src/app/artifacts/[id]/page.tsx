import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, artifact } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeArtifact } from "@/lib/api/serialize";
import { fmtDateTime } from "@/lib/format";
import { ResourceShell } from "@/components/resource/resource-shell";
import { FieldList } from "@/components/resource/field-list";
import { JsonCard } from "@/components/resource/json-card";
import { DeleteButton } from "@/components/resource/delete-button";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Artifact — agtls" };

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

type Params = { params: Promise<{ id: string }> };

export default async function ArtifactDetailPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getPageViewer();
  if (!viewer) redirect("/sign-in");

  const [row] = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1);
  if (!row) notFound();
  const owned = row.organizationId === null || viewer.organizationIds.includes(row.organizationId);
  if (!owned) notFound();

  const a = serializeArtifact(row);

  const editFields: FormField[] = [
    { name: "name", label: "Name", required: true, defaultValue: a.name },
    {
      name: "format",
      label: "Format",
      type: "select",
      required: true,
      defaultValue: a.format,
      options: [
        { value: "markdown", label: "Markdown" },
        { value: "html", label: "HTML" },
      ],
    },
    { name: "content", label: "Content", type: "textarea", required: true, defaultValue: a.content },
  ];

  return (
    <ResourceShell
      user={{ name: viewer.user.name, email: viewer.user.email }}
      breadcrumb={[{ label: "Artifacts", href: "/artifacts" }, { label: a.id }]}
      title={a.name}
      objectType="artifact"
    >
      <div className="mb-6 flex flex-col gap-4">
        <FieldList
          fields={[
            { label: "ID", value: a.id, mono: true },
            { label: "Format", value: a.format, mono: true },
            {
              label: "Raw URL",
              value: (
                <a
                  href={a.raw_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--text-strong)", textDecoration: "underline" }}
                >
                  {a.raw_url}
                </a>
              ),
              mono: true,
            },
            { label: "Created", value: fmtDateTime(a.created_at), mono: true },
            { label: "Updated", value: fmtDateTime(a.updated_at), mono: true },
          ]}
        />

        <div
          className="overflow-hidden rounded-xl"
          style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
        >
          <div
            className="px-4 py-3 uppercase"
            style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", fontWeight: 600, color: "var(--text-faint)", borderBottom: "1px solid var(--line-1)" }}
          >
            Content
          </div>
          <pre
            className="overflow-x-auto whitespace-pre-wrap px-4 py-4"
            style={{ fontFamily: mono, fontSize: 13, lineHeight: 1.7, color: "var(--text-strong)", margin: 0 }}
          >
            {a.content}
          </pre>
        </div>

        <div className="flex items-center gap-2.5">
          <ResourceForm
            collapsible
            toggleLabel="Edit"
            title="Edit artifact"
            method="PATCH"
            endpoint={`/api/artifacts/${a.id}`}
            submitLabel="Save changes"
            redirectTo={`/artifacts/${a.id}`}
            fields={editFields}
          />
          <DeleteButton
            endpoint={`/api/artifacts/${a.id}`}
            confirmMessage={`Delete artifact ${a.id}? This permanently removes its content.`}
            redirectTo="/artifacts"
          />
        </div>

        <JsonCard data={a} />
      </div>
    </ResourceShell>
  );
}
