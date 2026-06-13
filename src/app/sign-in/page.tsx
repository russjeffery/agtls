import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { enabledSocialProviders } from "@/lib/auth/providers";
import { safeRelativePath } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign in — agtls",
  description: "Sign in to your agtls account.",
};

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function SignInPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const redirectTo = safeRelativePath(next, "/dashboard");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your organizations, agents, and keys."
    >
      <AuthForm
        mode="sign-in"
        providers={enabledSocialProviders()}
        redirectTo={redirectTo}
      />
    </AuthShell>
  );
}
