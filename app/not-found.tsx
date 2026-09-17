import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="empty-state">
      <span className="eyebrow">404 / OUTSIDE THE UNIVERSE</span>
      <h1>This chapter isn’t here.</h1>
      <p>The page or catalog title could not be found.</p>
      <Button asChild>
        <Link href="/">Return to Mission Control</Link>
      </Button>
    </div>
  );
}
