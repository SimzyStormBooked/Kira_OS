"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { librarySchema, type LibraryResponse } from "@/lib/manuscripts/library-contract";
import { useWorkspace } from "@/lib/db/demo-store";
import "./library.css";

export class LibraryRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
type LibraryContextValue = {
  data: LibraryResponse | null; loading: boolean; error: string | null; authorized: boolean;
  reload: () => Promise<void>; clear: () => void;
  request: (url: string, options?: RequestInit) => Promise<unknown>;
};
const LibraryContext = createContext<LibraryContextValue | null>(null);

function PrivateLibraryProvider({ children }: { children: ReactNode }) {
  const { mode, clearPrivateScratchpads } = useWorkspace();
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(mode === "connected");
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const clearScratchpads = useRef(clearPrivateScratchpads);
  useEffect(() => { clearScratchpads.current = clearPrivateScratchpads; }, [clearPrivateScratchpads]);
  const clear = useCallback(() => { controller.current?.abort(); setData(null); setAuthorized(false); }, []);
  const request = useCallback(async (url: string, options?: RequestInit) => {
    const response = await fetch(url, { ...options, cache: "no-store", credentials: "same-origin" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 || (response.status === 403 && (!options?.method || options.method === "GET"))) {
        if (mounted.current) { clear(); clearScratchpads.current(); window.location.replace("/login"); }
      }
      const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Your library could not be reached. Please try again.";
      throw new LibraryRequestError(message, response.status);
    }
    return body;
  }, [clear]);
  const reload = useCallback(async () => {
    if (mode !== "connected" || !mounted.current) return;
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setLoading(true);
    try {
      const result = librarySchema.parse(await request("/api/library", { signal: next.signal }));
      if (!next.signal.aborted && mounted.current) { setData(result); setError(null); }
    } catch (failure) {
      if (!next.signal.aborted && mounted.current) setError(failure instanceof LibraryRequestError ? failure.message : "Your library could not be loaded. Please try again.");
    } finally { if (!next.signal.aborted && mounted.current) setLoading(false); }
  }, [mode, request]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(reload);
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; controller.current?.abort(); window.removeEventListener("focus", refresh); };
  }, [reload]);
  return <LibraryContext.Provider value={{ data, loading, error, authorized, reload, clear, request }}>{children}</LibraryContext.Provider>;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { mode, viewerEmail } = useWorkspace();
  return <PrivateLibraryProvider key={`${mode}:${viewerEmail ?? "demo"}`}>{children}</PrivateLibraryProvider>;
}
export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("LibraryProvider is required");
  return value;
}
