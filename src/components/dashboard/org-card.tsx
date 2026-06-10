import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OrgView } from "@/lib/orgs/queries";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "owner" ? "default" : "secondary"}>{role}</Badge>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="m-0 mb-2 uppercase"
      style={{
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: "0.10em",
        color: "var(--text-faint)",
      }}
    >
      {children}
    </p>
  );
}

export function OrgCard({ org }: { org: OrgView }) {
  const agents = org.members.filter((m) => m.isAgent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {org.name}
          <RoleBadge role={org.role} />
        </CardTitle>
        <CardDescription style={{ fontFamily: mono, fontSize: 12 }}>
          {org.id} · {org.slug} ·{" "}
          {agents.length === 1 ? "1 agent" : `${agents.length} agents`} with
          access
        </CardDescription>
      </CardHeader>

      <CardContent>
        <SectionLabel>Members</SectionLabel>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {org.members.map((m) => (
              <tr
                key={m.memberId}
                className="border-t"
                style={{ borderColor: "var(--line-1)" }}
              >
                <td className="py-2 pr-3">
                  {m.isAgent ? (
                    <Badge variant="outline">agent</Badge>
                  ) : (
                    <Badge variant="secondary">human</Badge>
                  )}
                </td>
                <td className="py-2 pr-3" style={{ color: "var(--text-strong)" }}>
                  {m.name}
                  {m.agent?.platform ? (
                    <span style={{ color: "var(--text-faint)" }}>
                      {" "}
                      · {m.agent.platform}
                    </span>
                  ) : null}
                </td>
                <td
                  className="py-2 pr-3"
                  style={{ fontFamily: mono, fontSize: 12, color: "var(--text-muted)" }}
                >
                  {m.isAgent
                    ? (m.agent
                        ? `${m.agent.type} · ${m.agent.status}`
                        : "unregistered")
                    : m.email}
                </td>
                <td className="py-2 pr-3">
                  <RoleBadge role={m.role} />
                </td>
                <td
                  className="py-2 text-right"
                  style={{ fontFamily: mono, fontSize: 12, color: "var(--text-faint)" }}
                >
                  joined {formatDate(m.joinedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5">
          <SectionLabel>API keys</SectionLabel>
          {org.keys.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--text-faint)" }}>
              No active keys.{" "}
              <a
                href={`/api/organizations/${org.id}/keys`}
                style={{ color: "var(--ds-accent)" }}
              >
                Create one
              </a>
              .
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {org.keys.map((k) => (
                  <tr
                    key={k.id}
                    className="border-t"
                    style={{ borderColor: "var(--line-1)" }}
                  >
                    <td
                      className="py-2 pr-3"
                      style={{ fontFamily: mono, fontSize: 12, color: "var(--text-strong)" }}
                    >
                      {k.keyPrefix}…
                    </td>
                    <td className="py-2 pr-3" style={{ color: "var(--text-muted)" }}>
                      {k.name}
                    </td>
                    <td className="py-2 pr-3">
                      {k.createdByAgent && (
                        <Badge variant="outline">
                          agent-issued
                        </Badge>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      style={{ fontFamily: mono, fontSize: 12, color: "var(--text-muted)" }}
                    >
                      {k.scopes ? k.scopes.join(" ") : "full access"}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ fontFamily: mono, fontSize: 12, color: "var(--text-faint)" }}
                    >
                      {k.lastUsedAt
                        ? `used ${formatDate(k.lastUsedAt)}`
                        : "never used"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
