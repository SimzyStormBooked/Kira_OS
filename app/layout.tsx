import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/kira/app-shell";
import { WorkspaceProvider } from "@/lib/db/demo-store";
import { freshWorkspace, type WorkspaceState } from "@/lib/db/workspace-state";
import {
  getWorkspaceSession,
  requireWorkspaceSession,
} from "@/lib/auth/session";
import { createConnectedRepository } from "@/lib/db/connected-repository";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Mission Control · KIRA OS", template: "%s · KIRA OS" },
  description:
    "Let Kira write. The agents run the business. A private author workspace.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const path = (await headers()).get("x-kira-pathname") ?? "/";
  const session = await getWorkspaceSession();
  let content: React.ReactNode;
  if (path === "/login") content = children;
  else if (session.authorization === "demo")
    content = (
      <WorkspaceProvider mode="demo" initialWorkspace={freshWorkspace()}>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    );
  else if (session.authorization !== "authorized") redirect("/login");
  else {
    let workspace: WorkspaceState | null = null;
    try {
      const auth = await requireWorkspaceSession();
      workspace = await createConnectedRepository(
        auth.supabase,
        auth.authorId,
      ).loadWorkspace();
    } catch {
      /* Fail closed, without rendering private child data. */
    }
    content = workspace ? (
      <WorkspaceProvider
        mode="connected"
        initialWorkspace={workspace}
        viewerEmail={session.user?.email}
      >
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    ) : (
      <main className="login-stage">
        <section className="login-card">
          <span className="eyebrow">KIRA OS</span>
          <h1>Your workspace needs a moment.</h1>
          <p>
            We could not load your saved decisions. Check the Supabase
            connection and migrations, then reload.
          </p>
          <Link className="text-link" href="/">
            Try again
          </Link>
          <form method="post" action="/auth/logout">
            <button type="submit">Sign out</button>
          </form>
        </section>
      </main>
    );
  }
  return (
    <html lang="en" className="dark">
      <body>{content}</body>
    </html>
  );
}
