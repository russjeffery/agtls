"use client";

import { createAuthClient } from "better-auth/react";
import { agentAuthClient } from "@better-auth/agent-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [agentAuthClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
