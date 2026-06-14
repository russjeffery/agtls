import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { AppHeader } from "@/components/app-header";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { buildDocsNav } from "@/lib/docs/nav";

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const sections = await buildDocsNav();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app)" }}>
      <AppHeader
        user={
          session ? { name: session.user.name, email: session.user.email } : null
        }
      />
      <div className="md:flex">
        <DocsSidebar sections={sections} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
