import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Feather, LockKeyhole, NotebookPen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWorkspaceSession } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/security";
import { buildSignInPath, safeInvitationEmail } from "@/lib/auth/invitation";

export const metadata: Metadata = { title: "Your invitation" };
export const dynamic = "force-dynamic";

const firstSteps = [
  {
    icon: BookOpen,
    title: "Open one of your books",
    body: "Prepare book details starts an editable brief beside its verified source. Saving records a review brief for you — it does not change a store listing.",
  },
  {
    icon: NotebookPen,
    title: "Save an idea at Cassandra's Desk",
    body: "Edit it first, then approve or reject when you are ready. A final decision locks the brief, and you can still add a lesson afterwards.",
  },
  {
    icon: Sparkles,
    title: "Ask Raven a business question",
    body: "Raven answers business questions only, never your manuscripts. Every answer stays an AI proposal for your judgment until you decide.",
  },
];

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const invited = safeInvitationEmail(params.for);
  const next = safeRedirectPath(params.next);
  const session = await getWorkspaceSession();
  const alreadySignedIn = session.authorization === "authorized";

  return (
    <main id="main-content" className="login-stage">
      <div className="login-intro">
        <Link href="/welcome" className="brand" aria-label="KIRA OS">
          <span className="brand-symbol">
            K<span>✦</span>
          </span>
          <span>
            KIRA<span className="brand-os"> OS</span>
            <small>AUTHOR INTELLIGENCE</small>
          </span>
        </Link>
        <span className="eyebrow">YOUR STORIES. YOUR WORLD.</span>
        <h1>
          Someone built you
          <br />
          <em>a quiet place to work.</em>
        </h1>
        <p>
          A private workspace for the business around your books — the catalog,
          the decisions, the follow-ups. The writing stays entirely yours.
        </p>
        <div className="login-mantra">
          <Feather size={20} />
          <span>Let Kira write.</span>
        </div>
      </div>

      <section className="login-card welcome-card" aria-labelledby="welcome-title">
        <span className="eyebrow">YOU HAVE BEEN INVITED IN</span>
        <h2 id="welcome-title">Welcome to your workspace.</h2>
        {alreadySignedIn ? (
          <>
            <p>You are already signed in on this device.</p>
            <Button asChild className="welcome-action">
              <Link href={next}>
                Open your workspace
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p>
              Tap below to sign in. It takes one minute, and everything you save
              is waiting the next time you come back.
            </p>
            {invited && (
              <p className="welcome-invited">
                Prepared for <strong>{invited}</strong>
              </p>
            )}
            <Button asChild className="welcome-action">
              <Link href={buildSignInPath(invited, next)}>
                Sign in to your workspace
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          </>
        )}

        <div className="welcome-steps">
          <h3>Three things worth trying first</h3>
          <ul>
            {firstSteps.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon size={17} strokeWidth={1.5} aria-hidden />
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="quiet-note login-privacy">
          <LockKeyhole size={13} />
          <span>
            Your password is never in this link — it is sent to you separately.
            This page does not create an account or grant access by itself; your
            workspace owner has already set up your account and can help if
            sign-in does not work.
          </span>
        </p>
      </section>
    </main>
  );
}
