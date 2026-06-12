import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listUserOrgs } from "@/lib/orgs/queries";
import { getPageViewer } from "@/lib/api/page-viewer";
import { ResourceShell } from "@/components/resource/resource-shell";
import { OrgCard } from "@/components/dashboard/org-card";
import { CreateOrgForm } from "@/app/dashboard/create-org-form";

export const metadata: Metadata = { title: "Organizations — agtls" };

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export default async function OrganizationsPage() {
  const viewer = await getPageViewer();
  if (!viewer) redirect("/sign-in");

  const orgs = await listUserOrgs(viewer.user.id);

  return (
    <ResourceShell
      user={{ name: viewer.user.name, email: viewer.user.email }}
      breadcrumb={[{ label: "Organizations", href: "/organizations" }]}
      title="Organizations"
      description="Organizations you belong to. Humans and agents are both members; API keys authenticate requests against an organization's resources."
    >
      <div className="flex flex-col gap-6">
        {orgs.map((org) => (
          <OrgCard key={org.id} org={org} />
        ))}
        {orgs.length === 0 && (
          <p style={{ fontFamily: mono, fontSize: 13, color: "var(--text-faint)" }}>
            No organizations yet. Create one to own tasks, webhooks, and API keys.
          </p>
        )}
      </div>

      <div className="mt-8">
        <CreateOrgForm />
      </div>
    </ResourceShell>
  );
}
