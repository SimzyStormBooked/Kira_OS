"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
import { useWorkspace, dismissNotice } from "@/lib/db/demo-store";
import { books } from "@/lib/data/seed";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", title: "Mission Control", icon: LayoutDashboard },
  { href: "/raven", title: "The Raven", icon: Feather },
  { href: "/universe", title: "The Universe", icon: BookOpen },
  { href: "/reader-pulse", title: "Reader Pulse", icon: Activity },
  { href: "/social", title: "Social", icon: Radio },
  { href: "/discoverability", title: "Discoverability", icon: Telescope },
  { href: "/hunt", title: "The Hunt", icon: Target },
  { href: "/campaigns", title: "Campaigns", icon: Megaphone },
  { href: "/outreach", title: "Outreach", icon: Users },
  { href: "/vault", title: "The Vault", icon: FolderOpen },
];
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { approvals } = useWorkspace();
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
        <ChevronDown size={13} />
      </div>
      <div className="nav-label">THE COMMAND CENTER</div>
      <nav aria-label="Main navigation">
        {navigation.map(({ href, title, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "nav-item",
              (href === "/" ? path === href : path.startsWith(href)) &&
                "active",
            )}
            aria-current={path === href ? "page" : undefined}
          >
            <Icon size={17} strokeWidth={1.6} />
            <span>{title}</span>
            {href === "/raven" && <span className="nav-dot" />}
          </Link>
        ))}
      </nav>
      <div className="nav-bottom">
        <Link
          href="/desk"
          onClick={onNavigate}
          className={cn("nav-item", path === "/desk" && "active")}
        >
          <FileCheck2 size={17} />
          <span>Cassandra’s Desk</span>
          <span className="count-badge">{count}</span>
        </Link>
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn("nav-item", path === "/settings" && "active")}
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
          <em>The agents run the business.</em>
        </p>
        <span>PHASE ONE · FOUNDATION</span>
      </div>
      <div className="user-profile">
        <span className="user-avatar">C</span>
        <span>
          Cassandra<small>Human in command</small>
        </span>
        <ShieldCheck size={16} />
      </div>
    </>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const state = useWorkspace();
  const title =
    pathname === "/desk"
      ? "Cassandra’s Desk"
      : pathname === "/settings"
        ? "Settings"
        : (navigation.find((n) => n.href !== "/" && pathname.startsWith(n.href))
            ?.title ?? "Mission Control");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
      kind: "Workspace",
    })),
    { href: "/desk", title: "Cassandra’s Desk", kind: "Approvals" },
    ...books.map((b) => ({
      href: `/universe/${b.slug}`,
      title: b.title,
      kind: "Book",
    })),
  ].filter((n) => n.title.toLowerCase().includes(query.toLowerCase()));
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
            <span className="human-control">
              <span />
              Human in control
            </span>
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
            <span className="topbar-avatar">C</span>
          </div>
        </header>
        <main id="main-content" className="page-container">
          {children}
        </main>
        <footer className="app-footer">
          <span>
            KIRA OS <span className="footer-cross">✦</span> BUILT AROUND YOUR
            WORLD.
          </span>
          <span>Demo workspace · Changes saved in this browser</span>
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
            onClick={dismissNotice}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </Button>
        </div>
      )}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogHeader>
            <DialogTitle>Search your universe</DialogTitle>
            <DialogDescription>
              Find a title or jump to a workspace.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Books, pages, approvals…"
            aria-label="Search books and pages"
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
                No matches. Try a book title or “Raven”.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
