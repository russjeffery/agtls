import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { enabledSocialProviders } from "@/lib/auth/providers";

export const metadata: Metadata = {
  title: "Sign in — agtls",
  description: "Sign in to your agtls account.",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your organizations, agents, and keys."
    >
      <AuthForm mode="sign-in" providers={enabledSocialProviders()} />
    </AuthShell>
  );
}
