"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Command,
  Copy,
  Feather,
  FileCheck2,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  Link2,
  GraduationCap,
  Menu,
  Megaphone,
  Moon,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Telescope,
  TriangleAlert,
  Users,
  Users2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/db/demo-store";
import { books } from "@/lib/data/seed";
import { useLibrary } from "./library-provider";
import { cn } from "@/lib/utils";
import { WorkspaceGuide } from "./workspace-guide";
import { InspirationDialogTrigger } from "./inspiration-shelf";
import { WorkspacePermissionNotice } from "./workspace-permission-notice";
import { SessionEndedDialog } from "./session-ended-dialog";
import { useKeptDrafts, type KeptDraft } from "./kept-drafts";
import { workspaceDestinations } from "@/lib/workspace-navigation";
import { workspaceSearchResponseSchema, workspaceSearchHref, type WorkspaceSearchResult } from "@/lib/search/contract";
import "./shell.css";

const availableNavigation = [
  {
    href: "/",
    title: "Mission Control",
    description: "Your day at a glance",
    icon: LayoutDashboard,
  },
  {
    href: "/raven",
    title: "Briefings",
    description: "Evidence & recommendations to review",
    icon: Feather,
  },
  {
    href: "/universe",
    title: "The Universe",
    description: "Your books & their details",
    icon: BookOpen,
  },
  {
    href: "/characters",
    title: "Character Studio",
    description: "Your cast, their portraits & your notes",
    icon: Users2,
  },
];
const plannedNavigation = [
  {
    href: "/reader-pulse",
    title: "Reader Pulse",
    description: "A future home for verified reviews and reader language",
    icon: Activity,
  },
  {
    href: "/social",
    title: "Social",
    description: "Which existing marketing connects with the readers you want",
    icon: Radio,
  },
  {
    href: "/hunt",
    title: "The Hunt",
    description: "Relevant creators, reviewers and opportunities, with evidence",
    icon: Target,
  },
  {
    href: "/campaigns",
    title: "Campaigns",
    description: "Approved campaigns with their evidence and results together",
    icon: Megaphone,
  },
  {
    href: "/outreach",
    title: "Outreach",
    description: "A shared memory of reviewer and media relationships",
    icon: Users,
  },
  {
    href: "/vault",
    title: "The Vault",
    description: "Approved source documents and a provenance-backed knowledge graph",
    icon: FolderOpen,
  },
];
const navigation = [...availableNavigation, ...plannedNavigation];
const creativeNavigation = [
  { href: "/discoverability", title: "Find Your Readers", description: "Website checks, search reports & Amazon listing reviews", icon: Search },
  { href: "/ads", title: "Ads & Next Steps", description: "Facebook results & your next experiment", icon: Megaphone },
  { href: "/opportunities", title: "Catalog Opportunities", description: "Find connections between your books", icon: Telescope },
  { href: "/plans", title: "Marketing Plans", description: "Goals, review & your next steps", icon: Target },
  { href: "/studio", title: "Ask Raven", description: "Think through your next move", icon: Lightbulb },
  { href: "/learn", title: "Learn & Create", description: "Small lessons. Your own agent ideas.", icon: GraduationCap },
  { href: "/connections", title: "Connections", description: "Your socials & useful tools", icon: Link2 },
];
const roleLabels = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { approvals, mode, viewerEmail, role } = useWorkspace();
  const [plannedOpen, setPlannedOpen] = useState(false);
  const count = approvals.filter((a) => a.status === "pending").length;
  return (
    <>
      <Link href="/" className="brand" onClick={onNavigate}>
        <span className="brand-symbol">
          K<span>✦</span>
        </span>
        <span>
          KIRA<span className="brand-os"> OS</span>
          <small>AUTHOR INTELLIGENCE</small>
        </span>
      </Link>
      <div className="workspace-label">
        <span className="workspace-avatar">KS</span>
        <span>
          Kira Stanley
          <small>Your pen name · Cassandra’s workspace</small>
        </span>
      </div>
      <div className="nav-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        {availableNavigation.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "nav-item nav-item-explained",
                (href === "/" ? path === href : path.startsWith(href)) &&
                  "active",
              )}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.6} />
              <span>
                {title}
                <small>{description}</small>
              </span>
            </Link>
          ))}
        <Link
          href="/desk"
          onClick={onNavigate}
          className={cn(
            "nav-item nav-item-explained",
            path === "/desk" && "active",
          )}
          aria-current={path === "/desk" ? "page" : undefined}
        >
          <FileCheck2 size={17} />
          <span>
            Cassandra’s Desk
            <small>Ideas, decisions & your guidance</small>
          </span>
          {count > 0 && (
            <span className="count-badge">
              {count}
              <span className="sr-only"> briefs waiting for you</span>
            </span>
          )}
        </Link>
        <div className="nav-label nav-creative-label">ROOM TO EXPLORE</div>
        {creativeNavigation.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} onClick={onNavigate}
            className={cn("nav-item nav-item-explained", path.startsWith(href) && "active")}
            aria-current={path.startsWith(href) ? "page" : undefined}>
            <Icon size={17} strokeWidth={1.6} />
            <span>{title}<small>{description}</small></span>
          </Link>
        ))}
      </nav>
      <div className="nav-planned">
        <button
          type="button"
          className="nav-planned-toggle"
          onClick={() => setPlannedOpen(!plannedOpen)}
          aria-expanded={plannedOpen}
          aria-controls={onNavigate ? "planned-mobile" : "planned-desktop"}
        >
          Coming later{" "}
          <ChevronDown size={13} className={plannedOpen ? "is-open" : ""} />
        </button>
        <div
          id={onNavigate ? "planned-mobile" : "planned-desktop"}
          hidden={!plannedOpen}
        >
          <p>Preview what can grow with your workspace.</p>
          {plannedNavigation.map(({ href, title, description, icon: Icon }) => (
            <Link
              className={cn("nav-item nav-item-planned", path === href && "active")}
              key={href}
              href={href}
              onClick={onNavigate}
            >
              <Icon size={16} />
              <span>
                {title}
                <small className="nav-planned-desc">{description}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="nav-bottom">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn("nav-item", path === "/settings" && "active")}
          aria-current={path === "/settings" ? "page" : undefined}
        >
          <Settings size={17} />
          <span>Settings</span>
        </Link>
      </div>
      <div className="sidebar-mantra">
        <Feather size={20} />
        <p>
          Let Kira write.
          <br />
          <em>A little help for the business.</em>
        </p>
        <span>YOUR WORDS. YOUR WORLD.</span>
      </div>
      <div className="user-profile">
        <span className="user-avatar">C</span>
        <span>
          Cassandra
          <small>
            {mode === "connected"
              ? `${roleLabels[role]}${viewerEmail ? ` · ${viewerEmail}` : ""}`
              : "Exploring the demo"}
          </small>
        </span>
        <ShieldCheck size={16} />
      </div>
    </>
  );
}
export function AppShell({
  children,
  dateKey,
}: {
  children: React.ReactNode;
  dateKey?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [savedSearch, setSavedSearch] = useState<{ query: string; results: WorkspaceSearchResult[]; error: string | null } | null>(null);
  const searchSequence = useRef(0);
  const searchOpener = useRef<HTMLElement | null>(null);
  const searchDestination = useRef<{ headingId: string | null } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutConfirmation, setLogoutConfirmation] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState<string | null>(null);
  const logoutLock = useRef(false);
  const signOutButtonRef = useRef<HTMLButtonElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  const state = useWorkspace();
  const library = useLibrary();
  const keptDrafts = useKeptDrafts();
  async function copyKept(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDraft(label);
    } catch {
      setCopiedDraft(null);
      state.showError(
        new Error(
          "This browser blocked copying. Select the text in the box and copy it yourself.",
        ),
      );
    }
  }
  function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (logoutLock.current) return;
    setLogoutError(null);
    if (state.hasUnsavedPrivateDrafts()) {
      setCopiedDraft(null);
      setLogoutConfirmation(true);
      return;
    }
    void completeSignOut();
  }
  async function completeSignOut() {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setSigningOut(true);
    setLogoutError(null);
    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      if (!response.ok || new URL(response.url).pathname !== "/login") throw new Error("We could not sign you out. Please try again.");
      state.clearPrivateScratchpads();
      window.location.replace("/login");
    } catch {
      const message = "We could not confirm sign-out. Your unfinished work is still here; please try again.";
      setLogoutError(message);
      state.showError(new Error(message));
      logoutLock.current = false;
      setSigningOut(false);
    }
  }
  const title =
    pathname === "/desk"
      ? "Cassandra’s Desk"
      : pathname === "/settings"
        ? "Settings"
        : pathname === "/access" ? "Workspace access"
        : ([...navigation, ...creativeNavigation].find((n) => n.href !== "/" && pathname.startsWith(n.href))
            ?.title ?? "Mission Control");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        if (document.querySelector("[role=dialog]")) return;
        e.preventDefault();
        searchOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const searchTerm = query.trim();
  const canSearchSaved = state.mode === "connected" && state.ready && !state.sessionEnded;
  const { endSession } = state;
  useEffect(() => {
    if (!searchOpen || !canSearchSaved || searchTerm.length < 2) return;
    const controller = new AbortController();
    const sequence = ++searchSequence.current;
    const current = () => !controller.signal.aborted && sequence === searchSequence.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`, { cache: "no-store", signal: controller.signal });
        if (!current()) return;
        if (response.status === 401 || response.status === 403) {
          setSavedSearch(null); endSession(); return;
        }
        const data = await response.json();
        if (!current()) return;
        if (!response.ok) throw new Error("Saved characters and Raven answers could not be searched. Try again.");
        const parsed = workspaceSearchResponseSchema.parse(data);
        setSavedSearch({ query: searchTerm, results: parsed.results, error: null });
      } catch {
        if (current()) setSavedSearch({ query: searchTerm, results: [], error: "Saved characters and Raven answers could not be searched. Try again." });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); searchSequence.current += 1; };
  }, [searchOpen, canSearchSaved, searchTerm, endSession]);
  const privateResults = canSearchSaved && savedSearch?.query === searchTerm ? savedSearch : null;
  const searchingSaved = canSearchSaved && searchTerm.length >= 2 && !privateResults;
  const results = [
    ...workspaceDestinations.filter(item => !item.ownerOnly || state.role === "owner").map(item => ({
      href: item.href, title: item.title,
      kind: item.group === "preview" ? "Coming later · Preview" : item.href === "/desk" ? "Briefs & decisions" : item.href === "/access" ? "Settings" : "Workspace",
      keywords: `${item.description} ${item.href === "/" ? "home dashboard" : item.href === "/raven" ? "raven recommendations" : item.href === "/universe" ? "books catalog" : item.href === "/desk" ? "ideas approvals drafts lessons" : item.href === "/access" ? "people team roles collaborators sharing" : item.href === "/settings" ? "password account setup export" : ""}`,
    })),
    ...(state.mode === "demo" || canSearchSaved ? state.approvals : []).map((approval) => ({
      href: `/desk?brief=${encodeURIComponent(approval.id)}`,
      title: approval.title,
      headingId: `brief-${approval.id}`,
      kind: approval.status === "pending" ? "Brief · Needs your eye" : `Brief · ${approval.status === "approved" ? "Approved" : "Rejected"}`,
      keywords: "brief approval decision",
    })),
    ...(state.mode === "connected" ? canSearchSaved ? library.data?.books ?? [] : [] : books).map((b) => ({
      href: `/universe/${b.slug}`,
      title: b.title,
      kind: "Book",
      keywords: "book catalog",
    })),
    ].filter((n) => `${n.title} ${n.keywords}`.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 24);
  const allResults = [...results, ...(privateResults?.results ?? []).map(result => ({
    href: workspaceSearchHref(result), title: result.title,
    kind: result.kind === "character" ? "Character profile" : "Raven answer",
    excerpt: result.excerpt,
  }))];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Navigation />
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="mobile-menu"
                  aria-label="Open navigation"
                >
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                  <SheetDescription>KIRA OS workspace</SheetDescription>
                </SheetHeader>
                <Navigation onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="topbar-kira">WORKSPACE</span>
            <span className="breadcrumb-divider">/</span>
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/quiet-room" aria-label="Open the Quiet Room, a calm view away from the day's list">
                <Moon size={16} aria-hidden="true" />
                <span className="search-label">Quiet Room</span>
              </Link>
            </Button>
            <InspirationDialogTrigger dateKey={dateKey} />
            <WorkspaceGuide />
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                searchOpener.current = event.currentTarget;
                setSearchOpen(true);
              }}
              aria-label="Search workspace"
            >
              <Search size={16} />
              <span className="search-label">Search</span>
              <kbd>
                <Command size={10} />K
              </kbd>
            </Button>
            {state.mode === "connected" ? (
              <form action="/auth/logout" method="post" onSubmit={(event) => void signOut(event)}>
                <Button ref={signOutButtonRef} variant="ghost" size="sm" type="submit" disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </form>
            ) : (
              <span className="topbar-avatar">C</span>
            )}
          </div>
        </header>
        <main id="main-content" className="page-container" tabIndex={-1}>
          <WorkspacePermissionNotice />
          {children}
        </main>
        <footer className="app-footer">
          <span>
            KIRA OS <span className="footer-cross" aria-hidden="true">✦</span> BUILT AROUND YOUR
            WORLD.
          </span>
          <span>
            {state.mode === "demo"
              ? "Demo workspace · Changes saved in this browser"
              : "Saved to your private workspace"}
          </span>
        </footer>
      </div>
      <div className="toast-region" role="status" aria-atomic="true">
        {!state.error && state.notice && (
          <div className="toast">
            <Check size={16} aria-hidden="true" />
            <span>{state.notice}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={state.dismissNotice}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </Button>
          </div>
        )}
      </div>
      <div className="toast-region" role="alert" aria-atomic="true">
        {state.error && (
          <div className="toast toast-error">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{state.error}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={state.dismissNotice}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </Button>
          </div>
        )}
      </div>
      <SessionEndedDialog />
      <Dialog open={logoutConfirmation} onOpenChange={(open) => { if (!signingOut) setLogoutConfirmation(open); }}>
        <DialogContent showCloseButton={!signingOut}
          onOpenAutoFocus={(event) => { event.preventDefault(); keepWorkingRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); signOutButtonRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>Sign out with unfinished work?</DialogTitle>
            <DialogDescription>You have unsaved work in this browser session. Signing out discards it, so copy anything you want to keep first. Your saved workspace records stay available.</DialogDescription>
          </DialogHeader>
          {keptDrafts.length > 0 && (
            <div className="signout-drafts">
              {keptDrafts.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="signout-copy-all"
                  onClick={() =>
                    void copyKept(
                      "everything below",
                      keptDrafts
                        .map((draft: KeptDraft) => `${draft.label}\n\n${draft.text}`)
                        .join("\n\n---\n\n"),
                    )
                  }
                >
                  <Copy size={14} aria-hidden="true" />
                  Copy all
                </Button>
              )}
              {keptDrafts.map((draft: KeptDraft) => (
                <div className="signout-draft" key={draft.id}>
                  <div className="signout-draft-top">
                    <label htmlFor={`signout-${draft.id}`}>{draft.label}</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyKept(draft.label, draft.text)}
                    >
                      <Copy size={14} aria-hidden="true" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    id={`signout-${draft.id}`}
                    readOnly
                    rows={draft.text.length > 400 ? 6 : 3}
                    value={draft.text}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="signout-copy-status" role="status">
            {copiedDraft ? `Copied to your clipboard: ${copiedDraft}` : ""}
          </p>
          {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
          <DialogFooter>
            <Button ref={keepWorkingRef} type="button" disabled={signingOut} onClick={() => setLogoutConfirmation(false)}>Keep working</Button>
            <Button type="button" variant="destructive" disabled={signingOut} onClick={() => void completeSignOut()}>{signingOut ? "Signing out…" : "Sign out and discard drafts"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={searchOpen && !state.sessionEnded} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSavedSearch(null); }}>
        <DialogContent className="search-dialog" onCloseAutoFocus={(event) => {
          const destination = searchDestination.current;
          searchDestination.current = null;
          event.preventDefault();
          if (!destination) {
            searchOpener.current?.focus();
            return;
          }
          // Selecting the current brief does not rerun the Desk's route effect.
          // Wait until the dialog releases focus; other routes focus on arrival.
          const headingId = destination.headingId;
          if (headingId) requestAnimationFrame(() => {
            const heading = document.getElementById(headingId);
            if (heading && heading.getClientRects().length > 0) {
              heading.focus({ preventScroll: true });
              heading.scrollIntoView({ block: "center", behavior: "instant" });
            }
          });
        }}>
          <DialogHeader>
            <DialogTitle>Search your universe</DialogTitle>
            <DialogDescription>
              Find a book, character, saved brief, Raven answer, or workspace page.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Books, characters, Raven answers, briefs, pages…" maxLength={200}
            aria-label="Search books, briefs and pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="sr-only" role="status">
            {allResults.length} {allResults.length === 1 ? "result" : "results"}{searchingSaved ? "; searching saved characters and Raven answers" : ""}
          </p>
          {searchingSaved && <p className="quiet-note" role="status">Searching saved characters and Raven answers…</p>}
          {canSearchSaved && searchTerm.length < 2 && <p className="quiet-note">Enter at least two characters to search character profiles and Raven answers.</p>}
          {privateResults?.error && <p className="form-error" role="alert">{privateResults.error}</p>}
          <div className="search-results">
            {allResults.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onNavigate={() => {
                  searchDestination.current = { headingId: "headingId" in r && typeof r.headingId === "string" ? r.headingId : null };
                  setSearchOpen(false);
                }}
              >
                <span>
                  {r.title}
                  <small>{r.kind}</small>{"excerpt" in r && <small>{r.excerpt}</small>}
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
            {allResults.length === 0 && !searchingSaved && (
              <p className="quiet-note">
                No matches. Try a book or saved brief title, or a page such as “Settings”.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
