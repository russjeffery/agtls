import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { listUserOrgs } from "@/lib/orgs/queries";
import { AppHeader } from "@/components/app-header";
import { KeysManager } from "./keys-manager";
import { FirstKeyForm } from "./first-key-form";

export const metadata: Metadata = {
  title: "API keys — agtls",
  description: "Create and revoke API keys for your organizations.",
};

const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const serif = "var(--font-newsreader, serif)";

export default async function KeysPage() {
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
            fontFamily: serif,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
            margin: "0 0 6px",
          }}
        >
          API keys
        </h1>
        <p
          className="m-0 mb-8"
          style={{ fontFamily: serif, fontSize: 15, color: "var(--text-muted)" }}
        >
          Keys authenticate API and MCP requests against an organization&apos;s
          resources. Pass them as{" "}
          <code style={{ fontFamily: mono, fontSize: 13 }}>
            Authorization: Bearer agt_…
          </code>
          . The full key is shown only once, at creation.
        </p>

        {orgs.length === 0 && (
          <section
            className="p-5"
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--line-1)",
              borderRadius: 8,
              boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
            }}
          >
            <FirstKeyForm />
          </section>
        )}

        <div className="flex flex-col gap-8">
          {orgs.map((org) => (
            <section
              key={org.id}
              className="p-5"
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--line-1)",
                borderRadius: 8,
                boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
              }}
            >
              <h2
                className="m-0 mb-1"
                style={{
                  fontFamily: serif,
                  fontSize: 21,
                  fontWeight: 500,
                  color: "var(--text-strong)",
                }}
              >
                {org.name}
              </h2>
              <p
                className="m-0 mb-4 text-xs"
                style={{ fontFamily: mono, color: "var(--text-faint)" }}
              >
                {org.id} · your role: {org.role}
              </p>
              <KeysManager
                orgId={org.id}
                keys={org.keys.map((k) => ({
                  id: k.id,
                  name: k.name,
                  keyPrefix: k.keyPrefix,
                  createdByAgent: k.createdByAgent,
                  lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
                  createdAt: k.createdAt.toISOString(),
                }))}
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
