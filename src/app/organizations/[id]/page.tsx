import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { listUserOrgs } from "@/lib/orgs/queries";
import { getPageViewer } from "@/lib/api/page-viewer";
import { serializeOrganization } from "@/lib/api/serialize";
import { ResourceShell } from "@/components/resource/resource-shell";
import { OrgCard } from "@/components/dashboard/org-card";
import { JsonCard } from "@/components/resource/json-card";
import { DeleteButton } from "@/components/resource/delete-button";

export const metadata: Metadata = { title: "Organization — agtls" };

type Params = { params: Promise<{ id: string }> };

export default async function OrganizationDetailPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getPageViewer();
  if (!viewer) redirect("/sign-in");

  // Membership-scoped: listUserOrgs only returns orgs the user belongs to, so a
  // miss here is correctly a 404 (also hides existence from non-members).
  const orgs = await listUserOrgs(viewer.user.id);
  const org = orgs.find((o) => o.id === id);
  if (!org) notFound();

  const json = serializeOrganization({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
  });

  return (
    <ResourceShell
      user={{ name: viewer.user.name, email: viewer.user.email }}
      breadcrumb={[{ label: "Organizations", href: "/organizations" }, { label: org.id }]}
      title={org.name}
      objectType="organization"
    >
      <div className="mb-6 flex flex-col gap-4">
        <OrgCard org={org} />

        {org.role === "owner" && (
          <DeleteButton
            endpoint={`/api/organizations/${org.id}`}
            confirmMessage={`Delete organization ${org.name}? This permanently deletes the organization and all of its resources.`}
            redirectTo="/organizations"
            label="Delete organization"
          />
        )}

        <JsonCard data={json} />
      </div>
    </ResourceShell>
  );
}
