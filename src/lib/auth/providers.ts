// Server-only: which social providers have credentials configured. The
// sign-in/sign-up pages pass this to the client form so only usable buttons
// render. Must mirror the socialProviders block in ./server.ts.
export function enabledSocialProviders(): string[] {
  const providers: string[] = [];
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push("github");
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push("google");
  }
  return providers;
}
