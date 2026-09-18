import { AccessPage } from "@/components/kira/access-page";
import { getWorkspaceSession, requireWorkspaceSession } from "@/lib/auth/session";
import { readWorkspaceAccess, type WorkspaceAccessDetails } from "@/lib/auth/workspace-role";
export const metadata = { title: "Workspace access" };
export default async function Page() {
  const session = await getWorkspaceSession();
  if (session.mode === "demo") return <AccessPage mode="demo" initialAccess={null} />;
  const verified = await requireWorkspaceSession();
  let access: WorkspaceAccessDetails | null = null;
  let error: string | null = null;
  try {
    access = await readWorkspaceAccess(verified);
  } catch {
    error = "Workspace access could not be loaded. Please refresh and try again.";
  }
  return <AccessPage mode="connected" initialAccess={access} initialError={error} />;
}
