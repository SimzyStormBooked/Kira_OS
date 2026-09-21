import { NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/auth/session";
export const adsHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export function adsFailure(error: unknown) { return NextResponse.json({ error: error instanceof WorkspaceAccessError ? error.message : "That advertising step could not finish. Check setup, account access, or try again in five minutes." }, { status: error instanceof WorkspaceAccessError ? error.status : 503, headers: adsHeaders }); }
