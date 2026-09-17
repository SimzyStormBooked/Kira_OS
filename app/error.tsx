"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <span className="eyebrow">A MOMENTARY INTERRUPTION</span>
      <h1>The thread slipped.</h1>
      <p>
        Your locally saved decisions are still in your browser. Try loading this
        workspace again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
