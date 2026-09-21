"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className="empty-state failure-state" role="alert">
      <TriangleAlert size={24} aria-hidden="true" />
      <span className="eyebrow">A MOMENTARY INTERRUPTION</span>
      <h1 ref={headingRef} tabIndex={-1}>
        Something didn’t load.
      </h1>
      <p>
        Anything you had already saved is untouched. Unsaved text in the page
        you were on may not have survived — check before retyping.
      </p>
      <Button onClick={reset}>Try again</Button>
      <Link className="text-link" href="/">
        Back to Mission Control
      </Link>
    </div>
  );
}
