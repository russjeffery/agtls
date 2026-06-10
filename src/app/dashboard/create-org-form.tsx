"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slugify(name) || "org" }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not create the organization.");
      return;
    }
    setName("");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex items-start gap-2.5 flex-wrap">
      <input
        type="text"
        required
        minLength={1}
        maxLength={100}
        placeholder="New organization name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, width: 260 }}
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
        {pending ? "…" : "Create organization"}
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
  );
}
