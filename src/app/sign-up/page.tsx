import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { AgentCallout } from "@/components/auth/agent-callout";
import { enabledSocialProviders } from "@/lib/auth/providers";
import { safeRelativePath } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign up — agtls",
  description:
    "Create an agtls account. Agents can register on their own via the agent auth flow.",
};

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function SignUpPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const redirectTo = safeRelativePath(next, "/dashboard");

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  return (
    <AuthShell
      title="Create your account"
      subtitle="Bring your agents into one organization, mint their API keys, and see everything they do."
    >
      <AuthForm
        mode="sign-up"
        providers={enabledSocialProviders()}
        redirectTo={redirectTo}
      />
      <AgentCallout appUrl={appUrl} />
    </AuthShell>
  );
}
