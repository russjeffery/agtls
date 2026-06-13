"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

// One client component covers both modes — the fields and authClient call are
// the only differences between sign-in and sign-up.

const DEFAULT_AFTER_AUTH_URL = "/dashboard";

// Carry a non-default post-auth redirect across the sign-in ⇄ sign-up toggle so
// a claim link (or any ?next) survives switching modes.
function withNext(href: string, redirectTo: string): string {
  if (redirectTo === DEFAULT_AFTER_AUTH_URL) return href;
  return `${href}?next=${encodeURIComponent(redirectTo)}`;
}

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

const inputStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 14,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid var(--line-2)",
  background: "var(--surface-well)",
  color: "var(--text-strong)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
  display: "block",
  marginBottom: 6,
};

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width={16} height={16} aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function SocialButtons({
  providers,
  setError,
  afterAuthUrl,
}: {
  providers: string[];
  setError: (msg: string | null) => void;
  afterAuthUrl: string;
}) {
  if (providers.length === 0) return null;

  const social = async (provider: "github" | "google") => {
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: afterAuthUrl,
    });
    if (error) setError(error.message ?? "Something went wrong.");
  };

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {providers.includes("github") && (
          <button
            type="button"
            onClick={() => social("github")}
            className="inline-flex items-center justify-center gap-2.5 w-full py-2.5 rounded cursor-pointer transition-colors text-sm"
            style={{
              fontFamily: mono,
              color: "var(--text-body)",
              background: "var(--surface-card)",
              border: "1px solid var(--line-2)",
            }}
          >
            <GitHubMark /> Continue with GitHub
          </button>
        )}
        {providers.includes("google") && (
          <button
            type="button"
            onClick={() => social("google")}
            className="inline-flex items-center justify-center gap-2.5 w-full py-2.5 rounded cursor-pointer transition-colors text-sm"
            style={{
              fontFamily: mono,
              color: "var(--text-body)",
              background: "var(--surface-card)",
              border: "1px solid var(--line-2)",
            }}
          >
            <GoogleMark /> Continue with Google
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 my-5">
        <span className="flex-1 h-px" style={{ background: "var(--line-1)" }} />
        <span style={{ fontFamily: mono, fontSize: 11, color: "var(--text-faint)" }}>
          or with email
        </span>
        <span className="flex-1 h-px" style={{ background: "var(--line-1)" }} />
      </div>
    </>
  );
}

export function AuthForm({
  mode,
  providers,
  redirectTo = DEFAULT_AFTER_AUTH_URL,
}: {
  mode: "sign-in" | "sign-up";
  providers: string[];
  /** Where to land after a successful auth. Defaults to /dashboard. */
  redirectTo?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(error.message ?? "Something went wrong.");
      return;
    }
    window.location.href = redirectTo;
  };

  return (
    <div
      className="p-6"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--line-1)",
        borderRadius: 8,
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
      }}
    >
      <SocialButtons
        providers={providers}
        setError={setError}
        afterAuthUrl={redirectTo}
      />

      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === "sign-up" && (
          <div>
            <label htmlFor="name" style={labelStyle}>
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}
        <div>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="m-0 text-sm"
            style={{ fontFamily: mono, color: "var(--red-400, #f87171)" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 rounded font-semibold cursor-pointer transition-colors text-sm disabled:opacity-60"
          style={{
            fontFamily: mono,
            background: "var(--ds-accent)",
            color: "var(--text-on-accent)",
            border: "none",
          }}
        >
          {pending
            ? "…"
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p
        className="m-0 mt-5 text-center text-sm"
        style={{ fontFamily: mono, color: "var(--text-faint)" }}
      >
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <a href={withNext("/sign-in", redirectTo)} style={{ color: "var(--ds-accent)" }}>
              Sign in
            </a>
          </>
        ) : (
          <>
            New here?{" "}
            <a href={withNext("/sign-up", redirectTo)} style={{ color: "var(--ds-accent)" }}>
              Create an account
            </a>
          </>
        )}
      </p>
    </div>
  );
}
