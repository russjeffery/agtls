"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="p-6"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--line-1)",
        borderRadius: 8,
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
      }}
    >
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="m-0 mb-4"
      style={{
        fontFamily: "var(--font-hanken, serif)",
        fontSize: 21,
        fontWeight: 500,
        color: "var(--text-strong)",
      }}
    >
      {children}
    </h2>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not change the password.");
      return;
    }
    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="current-password" style={labelStyle}>
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="new-password" style={labelStyle}>
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
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
      {success && (
        <p
          className="m-0 text-sm"
          style={{ fontFamily: mono, color: "var(--green-300)" }}
        >
          Password updated. Other sessions were signed out.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start text-sm font-semibold px-4 py-2.5 rounded cursor-pointer disabled:opacity-60"
        style={{
          fontFamily: mono,
          background: "var(--ds-accent)",
          color: "var(--text-on-accent)",
          border: "none",
        }}
      >
        {pending ? "…" : "Change password"}
      </button>
    </form>
  );
}

export function AccountSettings({
  user,
}: {
  user: { name: string; email: string; emailVerified: boolean };
}) {
  const [verificationSent, setVerificationSent] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const resendVerification = async () => {
    setVerifyError(null);
    const { error } = await authClient.sendVerificationEmail({
      email: user.email,
    });
    if (error) {
      setVerifyError(error.message ?? "Could not send the email.");
      return;
    }
    setVerificationSent(true);
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionTitle>Profile</SectionTitle>
        <dl
          className="m-0 grid gap-x-8 gap-y-2 text-sm"
          style={{ gridTemplateColumns: "auto 1fr", fontFamily: mono }}
        >
          <dt style={{ color: "var(--text-faint)" }}>Name</dt>
          <dd className="m-0" style={{ color: "var(--text-strong)" }}>
            {user.name}
          </dd>
          <dt style={{ color: "var(--text-faint)" }}>Email</dt>
          <dd className="m-0" style={{ color: "var(--text-strong)" }}>
            {user.email}{" "}
            {user.emailVerified ? (
              <span style={{ color: "var(--green-300)" }}>· verified</span>
            ) : (
              <span style={{ color: "var(--amber-400, #fbbf24)" }}>
                · unverified
              </span>
            )}
          </dd>
        </dl>
        {!user.emailVerified && (
          <div className="mt-4">
            <p
              className="m-0 mb-2 text-sm"
              style={{
                fontFamily: "var(--font-hanken, serif)",
                color: "var(--text-muted)",
              }}
            >
              Verify your email so agents that authenticate with it attach to
              your account and land in your organizations.
            </p>
            {verificationSent ? (
              <p
                className="m-0 text-sm"
                style={{ fontFamily: mono, color: "var(--green-300)" }}
              >
                Verification email sent — check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={resendVerification}
                className="text-sm px-3.5 py-2 rounded cursor-pointer"
                style={{
                  fontFamily: mono,
                  background: "transparent",
                  border: "1px solid var(--line-2)",
                  color: "var(--text-body)",
                }}
              >
                Resend verification email
              </button>
            )}
            {verifyError && (
              <p
                role="alert"
                className="m-0 mt-2 text-sm"
                style={{ fontFamily: mono, color: "var(--red-400, #f87171)" }}
              >
                {verifyError}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Change password</SectionTitle>
        <ChangePasswordForm />
      </Card>

      <Card>
        <SectionTitle>Session</SectionTitle>
        <button
          type="button"
          onClick={signOut}
          className="text-sm px-4 py-2.5 rounded cursor-pointer"
          style={{
            fontFamily: mono,
            background: "transparent",
            border: "1px solid var(--line-2)",
            color: "var(--red-400, #f87171)",
          }}
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}
