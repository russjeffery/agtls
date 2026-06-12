"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "datetime"
  | "list";

export interface FormField {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Prefill (edit mode). For "list" pass string[]; for "datetime" pass a
   * `YYYY-MM-DDTHH:mm` local string; otherwise a string. */
  defaultValue?: string | string[];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: mono,
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--line-2)",
  background: "var(--surface-well)",
  color: "var(--text-strong)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};

function initialValues(fields: FormField[]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    if (f.type === "list") out[f.name] = Array.isArray(f.defaultValue) ? f.defaultValue : [];
    else out[f.name] = typeof f.defaultValue === "string" ? f.defaultValue : "";
  }
  return out;
}

/**
 * Generic create/edit form for the resource pages. POSTs (create) or PATCHes
 * (edit) JSON to `endpoint`, coercing field values the way the API expects
 * (numbers, datetime → unix seconds, list → string[]). On success it navigates
 * to the new/updated resource. Mirrors the old hand-rolled HTML create form.
 */
export function ResourceForm({
  title,
  endpoint,
  method = "POST",
  fields,
  submitLabel,
  collapsible = false,
  toggleLabel,
  redirectTo,
}: {
  title: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  fields: FormField[];
  submitLabel?: string;
  collapsible?: boolean;
  /** Label for the collapsed toggle button. Defaults to `+ {title}`. */
  toggleLabel?: string;
  /** Where to go on success. Defaults: create → `${endpoint}/${id}`, edit → refresh. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsible);
  const [values, setValues] = useState(() => initialValues(fields));
  const [tagEntry, setTagEntry] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const setValue = (name: string, value: string | string[]) =>
    setValues((v) => ({ ...v, [name]: value }));

  const addTag = (name: string, raw: string) => {
    const value = raw.trim().replace(/,/g, "");
    if (!value) return;
    const current = (values[name] as string[]) ?? [];
    if (current.includes(value)) return;
    setValue(name, [...current, value]);
  };

  const removeTag = (name: string, value: string) =>
    setValue(name, ((values[name] as string[]) ?? []).filter((t) => t !== value));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);

    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (f.type === "list") {
        const arr = raw as string[];
        if (arr.length > 0) payload[f.name] = arr;
        continue;
      }
      const v = (raw as string).trim();
      if (v === "") continue;
      if (f.type === "number") payload[f.name] = Number(v);
      else if (f.type === "datetime")
        payload[f.name] = Math.floor(new Date(v).getTime() / 1000);
      else payload[f.name] = v;
    }

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    setPending(false);

    if (!res.ok) {
      setError(data?.error?.message ?? "Something went wrong.");
      return;
    }

    if (redirectTo) {
      router.push(redirectTo);
    } else if (method === "POST" && data?.id) {
      router.push(`${endpoint}/${data.id}`);
    } else {
      router.refresh();
    }
  };

  if (collapsible && !open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {toggleLabel ?? `+ ${title}`}
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3.5 rounded-xl p-4"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
    >
      <div
        className="uppercase"
        style={{
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          fontWeight: 600,
          color: "var(--text-faint)",
        }}
      >
        {title}
      </div>

      {fields.map((f) => {
        const id = `rf-${f.name}`;
        return (
          <div key={f.name} className="flex flex-col gap-1.5">
            <label htmlFor={id} style={labelStyle}>
              {f.label}
              {!f.required && (
                <span style={{ fontWeight: 500, textTransform: "none", color: "var(--text-faint)" }}>
                  {" "}
                  optional
                </span>
              )}
            </label>

            {f.type === "textarea" ? (
              <textarea
                id={id}
                rows={4}
                required={f.required}
                placeholder={f.placeholder}
                value={values[f.name] as string}
                onChange={(e) => setValue(f.name, e.target.value)}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            ) : f.type === "select" ? (
              <select
                id={id}
                required={f.required}
                value={values[f.name] as string}
                onChange={(e) => setValue(f.name, e.target.value)}
                style={{ ...inputStyle, colorScheme: "dark" }}
              >
                {!f.required && <option value="">{f.placeholder ?? "—"}</option>}
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "list" ? (
              <div
                className="flex flex-wrap items-center gap-1.5"
                style={{ ...inputStyle, cursor: "text", minHeight: 38 }}
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  input?.focus();
                }}
              >
                {((values[f.name] as string[]) ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: "var(--surface-card)", border: "1px solid var(--line-2)", fontSize: 12 }}
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeTag(f.name, tag)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex" }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1"
                  style={{ minWidth: 120, background: "transparent", border: "none", outline: "none", color: "var(--text-strong)", fontFamily: mono, fontSize: 13 }}
                  placeholder={f.placeholder}
                  value={tagEntry[f.name] ?? ""}
                  onChange={(e) => setTagEntry((t) => ({ ...t, [f.name]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(f.name, tagEntry[f.name] ?? "");
                      setTagEntry((t) => ({ ...t, [f.name]: "" }));
                    } else if (e.key === "Backspace" && !(tagEntry[f.name] ?? "")) {
                      const arr = (values[f.name] as string[]) ?? [];
                      if (arr.length) removeTag(f.name, arr[arr.length - 1]);
                    }
                  }}
                  onBlur={() => {
                    if (tagEntry[f.name]?.trim()) {
                      addTag(f.name, tagEntry[f.name]);
                      setTagEntry((t) => ({ ...t, [f.name]: "" }));
                    }
                  }}
                />
              </div>
            ) : (
              <input
                id={id}
                type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : "text"}
                required={f.required}
                placeholder={f.placeholder}
                value={values[f.name] as string}
                onChange={(e) => setValue(f.name, e.target.value)}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-3.5">
        {error && (
          <span role="alert" className="mr-auto" style={{ fontFamily: mono, fontSize: 12, color: "var(--red-400, #f87171)" }}>
            {error}
          </span>
        )}
        {collapsible && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : submitLabel ?? "Create"}
        </Button>
      </div>
    </form>
  );
}
