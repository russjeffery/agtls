"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client-side key management for one organization: create (full key shown
// exactly once) and revoke, both through the REST endpoints the docs describe.

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdByAgent: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const inputStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--line-2)",
  background: "var(--surface-well)",
  color: "var(--text-strong)",
  outline: "none",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-xs px-2.5 py-1 rounded cursor-pointer"
      style={{
        fontFamily: mono,
        background: "transparent",
        border: "1px solid var(--line-2)",
        color: "var(--text-muted)",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function KeysManager({
  orgId,
  keys,
}: {
  orgId: string;
  keys: KeyRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await fetch(`/api/organizations/${orgId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not create the key.");
      return;
    }
    const body = (await res.json()) as { key: string };
    setCreatedKey(body.key);
    setName("");
    router.refresh();
  };

  const revoke = async (keyId: string) => {
    setError(null);
    const res = await fetch(`/api/organizations/${orgId}/keys/${keyId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not revoke the key.");
      return;
    }
    router.refresh();
  };

  return (
    <div>
      {keys.length === 0 ? (
        <p className="m-0 mb-4 text-sm" style={{ color: "var(--text-faint)" }}>
          No active keys in this organization.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm mb-4">
          <tbody>
            {keys.map((k) => (
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
                <td
                  className="py-2 pr-3"
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    color: "var(--text-faint)",
                  }}
                >
                  {k.createdByAgent ? "agent-issued" : ""}
                </td>
                <td
                  className="py-2 pr-3"
                  style={{ fontFamily: mono, fontSize: 12, color: "var(--text-faint)" }}
                >
                  {k.lastUsedAt
                    ? `used ${k.lastUsedAt.slice(0, 10)}`
                    : "never used"}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => revoke(k.id)}
                    className="text-xs px-2.5 py-1 rounded cursor-pointer"
                    style={{
                      fontFamily: mono,
                      background: "transparent",
                      border: "1px solid var(--line-2)",
                      color: "var(--red-400, #f87171)",
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {createdKey && (
        <div
          className="flex items-center gap-3 p-3 mb-4 flex-wrap"
          style={{
            background: "var(--green-soft)",
            border: "1px solid rgba(32, 24, 255, 0.35)",
            borderRadius: 6,
          }}
        >
          <code
            className="text-xs break-all"
            style={{ fontFamily: mono, color: "var(--text-strong)" }}
          >
            {createdKey}
          </code>
          <CopyButton value={createdKey} />
          <span
            className="text-xs basis-full"
            style={{ fontFamily: mono, color: "var(--text-muted)" }}
          >
            Save this key now — it will not be shown again.
          </span>
        </div>
      )}

      <form onSubmit={create} className="flex items-center gap-2.5 flex-wrap">
        <input
          type="text"
          required
          maxLength={100}
          placeholder="Key name (e.g. production agent)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, width: 240 }}
        />
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-semibold px-3.5 py-2 rounded cursor-pointer disabled:opacity-60"
          style={{
            fontFamily: mono,
            background: "var(--ds-accent)",
            color: "var(--text-on-accent)",
            border: "none",
          }}
        >
          {pending ? "…" : "Create key"}
        </button>
        {error && (
          <p
            role="alert"
            className="m-0 text-sm basis-full"
            style={{ fontFamily: mono, color: "var(--red-400, #f87171)" }}
          >
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
