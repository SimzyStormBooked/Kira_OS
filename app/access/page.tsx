import { headers } from "next/headers";
import { AccessPage } from "@/components/kira/access-page";
import { getWorkspaceSession, requireWorkspaceSession } from "@/lib/auth/session";
import { readWorkspaceAccess, type WorkspaceAccessDetails } from "@/lib/auth/workspace-role";
import { resolveShareOrigin } from "@/lib/config";
export const metadata = { title: "Workspace access" };
export default async function Page() {
  const session = await getWorkspaceSession();
  const appOrigin = resolveShareOrigin((await headers()).get("host"));
  if (session.mode === "demo") return <AccessPage mode="demo" initialAccess={null} appOrigin={appOrigin} />;
  const verified = await requireWorkspaceSession();
  let access: WorkspaceAccessDetails | null = null;
  let error: string | null = null;
  try {
    access = await readWorkspaceAccess(verified);
  } catch {
    error = "Workspace access could not be loaded. Please refresh and try again.";
  }
  return <AccessPage mode="connected" initialAccess={access} initialError={error} appOrigin={appOrigin} />;
}
