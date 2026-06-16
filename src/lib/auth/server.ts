import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { newId, newUserId } from "@/lib/api/ids";
import { sendEmail } from "@/lib/email";
import { createOrgWithOwner } from "@/lib/orgs/service";
import { agentAuthPlugin } from "@/lib/agent-auth/openapi-plugin";

// BetterAuth model name → our `newId` prefix key, for models we want prefixed
// ids on. Anything not listed falls through to an opaque user-style id.
const ID_PREFIXED_MODELS = {
  organization: "organization",
  member: "member",
  invitation: "invitation",
  agentHost: "agentHost",
  agent: "agent",
  agentCapabilityGrant: "agentCapabilityGrant",
  approvalRequest: "approvalRequest",
} as const;

// Social sign-in is enabled per-provider by env. Leaving a provider's
// credentials unset simply hides that button — email/password always works.
const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string }
> = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
      // @better-auth/agent-auth plugin tables (keyed by model name).
      agentHost: schema.agentHost,
      agent: schema.agent,
      agentCapabilityGrant: schema.agentCapabilityGrant,
      approvalRequest: schema.approvalRequest,
    },
  }),
  advanced: {
    database: {
      // Global across all models — prefix org-plugin and agent-auth rows like
      // our own IDs, fall through to an opaque id for user/session/etc.
      generateId: ({ model }) => {
        const prefix =
          ID_PREFIXED_MODELS[model as keyof typeof ID_PREFIXED_MODELS];
        return prefix ? newId(prefix) : newUserId();
      },
    },
  },
  plugins: [organization({ creatorRole: "owner" }), agentAuthPlugin()],
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          // Every human signup gets a personal org. JIT agent users are
          // inserted with raw Drizzle (bypassing this adapter hook), so agents
          // never trigger an org here.
          await createOrgWithOwner(newUser.id, `${newUser.name}'s org`);
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Sign-in works immediately; verification is still worth doing because
    // agent-auth only binds agents to users with a *verified* email
    // (findUserByVerifiedEmail). Until verified, an agent claiming with this
    // email lands on a separate JIT account instead of the human's.
    requireEmailVerification: false,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your agtls email",
        text: [
          `Verify your email to finish setting up your agtls account:`,
          ``,
          url,
          ``,
          `Verifying also lets agents that authenticate with this email`,
          `attach to your account and work in your organizations.`,
        ].join("\n"),
        html: `<p>Verify your email to finish setting up your <strong>agtls</strong> account:</p>
<p><a href="${url}">${url}</a></p>
<p>Verifying also lets agents that authenticate with this email attach to your account and work in your organizations.</p>`,
      });
    },
  },
  socialProviders,
  account: {
    // GitHub/Google sign-ins with a matching verified email attach to the
    // existing user row — including users originally JIT-provisioned by the
    // agent-auth flows — so a human and their agents share one account.
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});
