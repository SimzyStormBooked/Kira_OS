import { ConnectionsPage } from "@/components/kira/connections-page";
import { getWorkspaceSession, requireWorkspaceSession } from "@/lib/auth/session";
import { createConnectionRepository } from "@/lib/connections/repository";
import type { ConnectionLink } from "@/lib/connections/schema";
import { loadMetaView } from "@/lib/connections/meta-repository";
import type { MetaView } from "@/lib/connections/meta-schema";
export const metadata = { title: "Connections" };

export default async function Page({ searchParams }: { searchParams: Promise<{ meta?: string | string[] }> }) {
  const result = (await searchParams).meta;
  const metaResult = typeof result === "string" ? result : undefined;
  const access = await getWorkspaceSession();
  if (access.mode === "demo") return <ConnectionsPage initialLinks={[]} canEdit={false} mode="demo" />;
  const session = await requireWorkspaceSession();
  let initialLinks: ConnectionLink[] = [], canEdit = false, loadError: string | undefined;
  let metaView: MetaView = { configured: false, isOwner: false, connection: null, unavailable: true };
  try {
    const [links, owner, member] = await Promise.all([
      createConnectionRepository(session.supabase, session.authorId).load(),
      session.supabase.from("authors").select("owner_user_id").eq("id", session.authorId).maybeSingle(),
      session.supabase.from("author_members").select("role").eq("author_id", session.authorId).eq("user_id", session.user.id).maybeSingle(),
    ]);
    if (owner.error || member.error) throw new Error("Membership unavailable");
    initialLinks = links;
    canEdit = owner.data?.owner_user_id === session.user.id || member.data?.role === "editor";
    metaView = await loadMetaView(session.supabase, session.authorId, session.user.id);
  } catch {
    loadError = "Your saved links could not be loaded. Reload this page to try again.";
  }
  return <ConnectionsPage initialLinks={initialLinks} canEdit={canEdit} mode="connected" loadError={loadError} metaView={metaView} metaResult={metaResult} />;
}
