"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/db/demo-store";

export function WorkspacePermissionNotice() {
  const { roleError, busy, refresh } = useWorkspace();
  const retryRequested = useRef(false);
  useEffect(() => {
    if (!roleError && retryRequested.current) {
      retryRequested.current = false;
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }, [roleError]);
  if (!roleError) return null;
  return (
    <aside className="workspace-permission-notice" aria-label="Workspace permissions">
      <p className="quiet-note" role="status">{roleError}</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => { retryRequested.current = true; void refresh(); }}>
        {busy ? "Checking permissions…" : "Check permissions again"}
      </Button>
    </aside>
  );
}
