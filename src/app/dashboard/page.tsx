import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { listUserOrgs } from "@/lib/orgs/queries";
import { AppHeader } from "@/components/app-header";
import { OrgCard } from "@/components/dashboard/org-card";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = {
  title: "Dashboard — agtls",
  description: "Your organizations, agents, and API keys.",
};

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const orgs = await listUserOrgs(session.user.id);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app)" }}>
      <AppHeader
        user={{ name: session.user.name, email: session.user.email }}
      />
      <div className="mx-auto w-full px-5 py-10" style={{ maxWidth: 860 }}>
        <h1
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
            margin: "0 0 6px",
          }}
        >
          Your organizations
        </h1>
        <p
          className="m-0 mb-8"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 15,
            color: "var(--text-muted)",
          }}
        >
          Every member — human or agent — can reach the same resources with
          their own credentials.
        </p>

        <div className="flex flex-col gap-6">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
          {orgs.length === 0 && (
            <p style={{ fontFamily: mono, fontSize: 13, color: "var(--text-faint)" }}>
              No organizations yet. Create one to own tasks, webhooks, and API
              keys.
            </p>
          )}
        </div>

        <div className="mt-8">
          <CreateOrgForm />
        </div>
      </div>
    </div>
  );
}
