import { SettingsPage } from "@/components/kira/settings-page";
import { getWorkspaceSession, requireWorkspaceSession } from "@/lib/auth/session";
import { getPasswordSetupEligibility } from "@/lib/auth/password-setup";
export const metadata = { title: "Settings" };
export default async function Page() {
  let canChoosePasswordAfterLink = false;
  if ((await getWorkspaceSession()).authorization === "authorized") {
    const session = await requireWorkspaceSession();
    canChoosePasswordAfterLink = (await getPasswordSetupEligibility(session)).eligible;
  }
  return <SettingsPage canChoosePasswordAfterLink={canChoosePasswordAfterLink} />;
}
