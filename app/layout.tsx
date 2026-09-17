import type { Metadata } from "next";
import { AppShell } from "@/components/kira/app-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Mission Control · KIRA OS", template: "%s · KIRA OS" },
  description:
    "Let Kira write. The agents run the business. KIRA OS author intelligence — Phase One demo.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
