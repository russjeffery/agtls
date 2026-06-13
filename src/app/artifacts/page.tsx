import type { Metadata } from "next";
import { inArray, desc } from "drizzle-orm";
import { db, artifact } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeArtifact } from "@/lib/api/serialize";
import { fmtDate } from "@/lib/format";
import { ResourceShell } from "@/components/resource/resource-shell";
import { ResourceTable } from "@/components/resource/resource-table";
import { ResourceForm, type FormField } from "@/components/resource/resource-form";

export const metadata: Metadata = { title: "Artifacts — agtls" };

const createFields: FormField[] = [
  { name: "name", label: "Name", placeholder: "Project context", required: true },
  {
    name: "format",
    label: "Format",
    type: "select",
    required: true,
    defaultValue: "markdown",
    options: [
      { value: "markdown", label: "Markdown" },
      { value: "html", label: "HTML" },
    ],
  },
  { name: "content", label: "Content", type: "textarea", placeholder: "# Notes\n…", required: true },
];

export default async function ArtifactsPage() {
  const viewer = await getPageViewer();

  const rows = viewer?.organizationIds.length
    ? await db
      .select()
      .from(artifact)
      .where(inArray(artifact.organizationId, viewer.organizationIds))
      .orderBy(desc(artifact.createdAt))
      .limit(100)
    : [];
  const data = rows.map(serializeArtifact);

  return (
    <ResourceShell
      user={viewer ? { name: viewer.user.name, email: viewer.user.email } : null}
      breadcrumb={[{ label: "Artifacts", href: "/artifacts" }]}
      title="Artifacts"
      description="Markdown or HTML files an agent can store and recall. Each artifact is a single file of content, served raw at its raw_url."
    >
      <div className="mb-6">
        <ResourceForm
          collapsible
          title="New artifact"
          endpoint="/api/artifacts"
          submitLabel="Create artifact"
          fields={createFields}
        />
      </div>

      <ResourceTable
        columns={[
          { key: "id", label: "ID", mono: true },
          { key: "name", label: "Name" },
          { key: "format", label: "Format", mono: true },
          { key: "created", label: "Created", mono: true },
        ]}
        rows={data.map((a) => ({
          id: a.id,
          name: a.name,
          format: a.format,
          created: fmtDate(a.created_at),
          href: `/artifacts/${a.id}`,
        }))}
        emptyMessage={
          viewer
            ? "No artifacts yet. Create one above."
            : "Sign in to see your organization's artifacts. Artifacts created without signing in are public to anyone with the ID."
        }
      />
    </ResourceShell>
  );
}
