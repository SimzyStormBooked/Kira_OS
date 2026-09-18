import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Feather, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/kira/login-form";
import { Button } from "@/components/ui/button";
import { getWorkspaceSession } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/security";

export const metadata: Metadata = { title: "Welcome home" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await getWorkspaceSession();
  const next = safeRedirectPath((await searchParams).next);
  if (session.authorization === "authorized") redirect(next);
  const canSignIn = session.configured && session.mode === "connected" && !session.user;
  return (
    <main id="main-content" className="login-stage">
      <div className="login-intro">
        <Link href="/" className="brand" aria-label="KIRA OS home">
          <span className="brand-symbol">K<span>✦</span></span>
          <span>KIRA<span className="brand-os"> OS</span><small>AUTHOR INTELLIGENCE</small></span>
        </Link>
        <span className="eyebrow">YOUR STORIES. YOUR WORLD.</span>
        <h1>A little more room<br /><em>to be the author.</em></h1>
        <p>The books are yours. The decisions are yours. Let the business finally have a place of its own.</p>
        <div className="login-mantra"><Feather size={20} /><span>Let Kira write.</span></div>
      </div>
      <section className="login-card" aria-labelledby="login-title">
        <ShieldCheck size={25} strokeWidth={1.4} />
        <span className="eyebrow">WELCOME HOME, CASSANDRA</span>
        <h2 id="login-title">Your private workspace.</h2>
        {canSignIn ? <><p>Sign in to pick up where you left off.</p><LoginForm next={next} /></> :
          session.mode === "demo" ? <>
            <p>The demo is ready to explore. Private sign-in will be available once your Supabase workspace is connected.</p>
            <Button asChild><Link href="/">Explore the demo</Link></Button>
          </> : session.authorization === "forbidden" ? <>
            <p role="alert">This account has not been added to this workspace. Ask your workspace owner for access.</p>
            <form action="/auth/logout" method="post"><Button type="submit">Use another account</Button></form>
          </> : <>
            <p role="alert">{session.authorization === "unavailable"
              ? "Your workspace is temporarily unavailable. Please try again in a moment."
              : "Your private workspace is being prepared. Your workspace owner can finish the connection in the setup guide."}</p>
            <p className="quiet-note">Private workspace access stays closed until the connection is ready.</p>
            {session.user && <form action="/auth/logout" method="post"><Button type="submit" variant="outline">Sign out</Button></form>}
          </>}
      </section>
    </main>
  );
}
