import type { Metadata } from "next";
import Link from "next/link";
import { Feather, ShieldCheck } from "lucide-react";
import { OneTimeSignIn } from "@/components/kira/one-time-sign-in";

export const metadata: Metadata = {
  title: "Your private welcome",
  description: "A private, one-time welcome to your KIRA OS workspace.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

/** Opening or previewing this page never verifies or consumes a sign-in link. */
export default function WelcomePage() {
  return (
    <main id="main-content" className="login-stage">
      <div className="login-intro">
        <Link href="/login" className="brand" aria-label="KIRA OS sign in" prefetch={false}>
          <span className="brand-symbol">K<span>✦</span></span>
          <span>KIRA<span className="brand-os"> OS</span><small>AUTHOR INTELLIGENCE</small></span>
        </Link>
        <span className="eyebrow">YOUR STORIES. YOUR WORLD.</span>
        <h1>A little more room<br /><em>to be the author.</em></h1>
        <p>The books are yours. The decisions are yours. Your own space to gather ideas, find a next step, and make room for what matters.</p>
        <div className="login-mantra"><Feather size={20} aria-hidden="true" /><span>Let Kira write.</span></div>
      </div>
      <section className="login-card" aria-labelledby="welcome-title">
        <ShieldCheck size={25} strokeWidth={1.4} aria-hidden="true" />
        <span className="eyebrow">WELCOME TO KIRA OS</span>
        <h2 id="welcome-title">Your space is waiting.</h2>
        <p>Use your private link to sign in. No password is needed for this visit.</p>
        <OneTimeSignIn />
      </section>
    </main>
  );
}
