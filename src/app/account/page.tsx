import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { AppHeader } from "@/components/app-header";
import { AccountSettings } from "./account-settings";

export const metadata: Metadata = {
  title: "Account — agtls",
  description: "Manage your agtls account.",
};

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app)" }}>
      <AppHeader
        user={{ name: session.user.name, email: session.user.email }}
      />
      <div className="mx-auto w-full px-5 py-10" style={{ maxWidth: 640 }}>
        <h1
          style={{
            fontFamily: "var(--font-archivo, system-ui, sans-serif)",
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "var(--text-strong)",
            margin: "0 0 24px",
          }}
        >
          Account
        </h1>
        <AccountSettings
          user={{
            name: session.user.name,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
          }}
        />
      </div>
    </div>
  );
}
