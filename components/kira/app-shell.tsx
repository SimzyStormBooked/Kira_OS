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
  Feather,
  FileCheck2,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  Link2,
  GraduationCap,
  Menu,
  Megaphone,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Telescope,
  Users,
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
import { useWorkspace } from "@/lib/db/demo-store";
import { books } from "@/lib/data/seed";
import { cn } from "@/lib/utils";
import { WorkspaceGuide } from "./workspace-guide";
import { InspirationDialogTrigger } from "./inspiration-shelf";
import { WorkspacePermissionNotice } from "./workspace-permission-notice";

const navigation = [
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
  { href: "/reader-pulse", title: "Reader Pulse", icon: Activity },
  { href: "/social", title: "Social", icon: Radio },
  { href: "/discoverability", title: "Discoverability", icon: Telescope },
  { href: "/hunt", title: "The Hunt", icon: Target },
  { href: "/campaigns", title: "Campaigns", icon: Megaphone },
  { href: "/outreach", title: "Outreach", icon: Users },
  { href: "/vault", title: "The Vault", icon: FolderOpen },
];
const creativeNavigation = [
  { href: "/studio", title: "Ask Raven", description: "Think through your next move", icon: Lightbulb },
  { href: "/learn", title: "Learn & Create", description: "Small lessons. Your own agent ideas.", icon: GraduationCap },
  { href: "/connections", title: "Connections", description: "Your socials & useful tools", icon: Link2 },
];
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { approvals, mode, viewerEmail } = useWorkspace();
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
          Kira Stanley<small>Author workspace</small>
        </span>
      </div>
      <div className="nav-label">THE COMMAND CENTER</div>
      <nav aria-label="Main navigation">
        {navigation
          .slice(0, 3)
          .map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={title}
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
                <small aria-hidden="true">{description}</small>
              </span>
            </Link>
          ))}
        <Link
          href="/desk"
          aria-label="Cassandra’s Desk"
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
            <small aria-hidden="true">Ideas, decisions & your guidance</small>
          </span>
          <span
            className="count-badge"
            aria-label={`${count} pending decisions`}
          >
            {count}
          </span>
        </Link>
        <div className="nav-label nav-creative-label">ROOM TO EXPLORE</div>
        {creativeNavigation.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} aria-label={title} onClick={onNavigate}
            className={cn("nav-item nav-item-explained", path.startsWith(href) && "active")}
            aria-current={path.startsWith(href) ? "page" : undefined}>
            <Icon size={17} strokeWidth={1.6} />
            <span>{title}<small aria-hidden="true">{description}</small></span>
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
          {navigation.slice(3).map(({ href, title, icon: Icon }) => (
            <Link
              className={cn("nav-item", path === href && "active")}
              key={href}
              href={href}
              onClick={onNavigate}
            >
              <Icon size={16} />
              <span>{title}</span>
              <small>Preview</small>
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
          {mode === "connected" ? viewerEmail : "Cassandra"}
          <small>Human in command</small>
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
  const [signingOut, setSigningOut] = useState(false);
  const [logoutConfirmation, setLogoutConfirmation] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const logoutLock = useRef(false);
  const signOutButtonRef = useRef<HTMLButtonElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  const state = useWorkspace();
  function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (logoutLock.current) return;
    setLogoutError(null);
    if (state.hasUnsavedPrivateDrafts()) {
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
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const results = [
    ...navigation.map((n) => ({
      href: n.href,
      title: n.title,
      keywords: `${n.description ?? ""} ${n.href === "/raven" ? "raven recommendations" : n.href === "/universe" ? "books catalog" : n.href === "/" ? "home dashboard" : ""}`,
      kind: ["/", "/raven", "/universe"].includes(n.href)
        ? "Workspace"
        : "Coming later · Preview",
    })),
    { href: "/desk", title: "Cassandra’s Desk", kind: "Briefs & decisions", keywords: "ideas approvals drafts lessons" },
    ...creativeNavigation.map((n) => ({ href: n.href, title: n.title, kind: "Workspace", keywords: n.description })),
    { href: "/access", title: "Workspace access", kind: "Settings", keywords: "people team roles collaborators sharing" },
    { href: "/settings", title: "Settings", kind: "Workspace", keywords: "password account setup export" },
    ...state.approvals.map((approval) => ({
      href: `/desk?brief=${encodeURIComponent(approval.id)}`,
      title: approval.title,
      kind: approval.status === "pending" ? "Brief · Needs your eye" : `Brief · ${approval.status === "approved" ? "Approved" : "Rejected"}`,
      keywords: "brief approval decision",
    })),
    ...books.map((b) => ({
      href: `/universe/${b.slug}`,
      title: b.title,
      kind: "Book",
      keywords: "book catalog",
    })),
  ].filter((n) => `${n.title} ${n.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
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
            <InspirationDialogTrigger dateKey={dateKey} />
            <WorkspaceGuide />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchOpen(true)}
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
            KIRA OS <span className="footer-cross">✦</span> BUILT AROUND YOUR
            WORLD.
          </span>
          <span>
            {state.mode === "demo"
              ? "Demo workspace · Changes saved in this browser"
              : "Private workspace · Saved securely in Supabase"}
          </span>
        </footer>
      </div>
      {(state.notice || state.error) && (
        <div
          className={cn("toast", state.error && "toast-error")}
          role={state.error ? "alert" : "status"}
        >
          <Check size={16} />
          <span>{state.error || state.notice}</span>
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
      <Dialog open={logoutConfirmation} onOpenChange={(open) => { if (!signingOut) setLogoutConfirmation(open); }}>
        <DialogContent showCloseButton={!signingOut}
          onOpenAutoFocus={(event) => { event.preventDefault(); keepWorkingRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); signOutButtonRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>Sign out with unfinished work?</DialogTitle>
            <DialogDescription>You have unsaved work in this browser session. Signing out discards unfinished desk briefs, workshop notes, and questions. Your saved workspace records stay available.</DialogDescription>
          </DialogHeader>
          {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
          <DialogFooter>
            <Button ref={keepWorkingRef} type="button" variant="outline" disabled={signingOut} onClick={() => setLogoutConfirmation(false)}>Keep working</Button>
            <Button type="button" disabled={signingOut} onClick={() => void completeSignOut()}>{signingOut ? "Signing out…" : "Sign out and discard drafts"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogHeader>
            <DialogTitle>Search your universe</DialogTitle>
            <DialogDescription>
              Find a book, saved brief, or workspace page.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Books, saved briefs, pages…"
            aria-label="Search books, briefs and pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="search-results">
            {results.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={() => setSearchOpen(false)}
              >
                <span>
                  {r.title}
                  <small>{r.kind}</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
            {results.length === 0 && (
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
