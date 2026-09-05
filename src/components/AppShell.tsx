import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useOnboarding } from "@/lib/onboarding-context";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  Wallet,
  MapPin,
  Landmark,
  FileText,
  Scale,
  Settings,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Globe,
  Sparkles,
  MoreHorizontal,
  HelpCircle,
  Home,
  Store,
  IndianRupee,
  TrendingUp,
  Calculator,
  Target,
  ShieldCheck,
  Compass,
} from "lucide-react";

type Icon = ComponentType<{ className?: string }>;

interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /** match only exact path (for parents of overlapping routes) */
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const APP_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Home", to: "/dashboard", icon: LayoutDashboard, exact: true },
      { label: "AI Advisor", to: "/advisor", icon: Bot },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Business Analysis", to: "/analysis", icon: ShieldCheck },
      { label: "Compare Businesses", to: "/compare", icon: Scale },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Financial Planning", to: "/finance", icon: Wallet },
      { label: "Advisory Journey", to: "/plan", icon: Compass },
      { label: "What-If Simulator", to: "/what-if", icon: Calculator },
    ],
  },
  {
    label: "Market",
    items: [{ label: "Market & Competition", to: "/market", icon: MapPin }],
  },
  {
    label: "Financing",
    items: [{ label: "Schemes & Financing", to: "/schemes", icon: Landmark }],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports Hub", to: "/reports", icon: FileText, exact: true },
      { label: "Decision Report", to: "/report", icon: TrendingUp, exact: true },
      { label: "Loan Application", to: "/application", icon: IndianRupee },
    ],
  },
];

/** Paths that live inside the app shell (used to lift the voice bubble above the mobile nav). */
export function isShellPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/advisor") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/market") ||
    pathname.startsWith("/schemes") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/what-if") ||
    pathname.startsWith("/report") ||
    pathname.startsWith("/application") ||
    pathname.startsWith("/plan") ||
    pathname.startsWith("/settings")
  );
}

export function isShellActive(location: ReturnType<typeof useLocation>) {
  return isShellPath(location.pathname);
}

/* ────────────────────────────────────────────────────────────────────────────
 * NAV LINK (shared between desktop sidebar, mobile drawer and bottom nav)
 * ──────────────────────────────────────────────────────────────────────────── */
function NavRow({
  item,
  onClick,
  className,
}: {
  item: NavItem;
  onClick?: () => void;
  className?: string;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-emerald-600/10 text-emerald-800"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-emerald-700" : "text-muted-foreground group-hover:text-foreground")} />
          <span className="truncate">{item.label}</span>
          {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />}
        </>
      )}
    </NavLink>
  );
}

function NavSectionList({ onClick }: { onClick?: () => void }) {
  return (
    <div className="space-y-5">
      {APP_NAV.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavRow key={item.to} item={item} onClick={onClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * BUSINESS CONTEXT CHIP
 * ──────────────────────────────────────────────────────────────────────────── */
function ContextChip() {
  const { business, location, subCategory } = useOnboarding();
  return (
    <Link
      to="/settings"
      title="Your business profile"
      className="hidden items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60 sm:flex"
    >
      {business ? (
        <>
          <span className="text-sm leading-none">{business.icon}</span>
          <span className="max-w-[10rem] truncate text-xs font-semibold text-foreground">
            {business.name}
            {subCategory ? ` · ${subCategory.name}` : ""}
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="max-w-[8rem] truncate text-[11px] text-muted-foreground">
            {location ? `${location.name}, ${location.district}` : "No location set"}
          </span>
        </>
      ) : (
        <>
          <Store className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">No assessment yet</span>
        </>
      )}
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * USER MENU
 * ──────────────────────────────────────────────────────────────────────────── */
function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    setOpen(false);
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    navigate("/");
  };

  const email = user?.email ?? user?.name ?? "";
  const initials = (user?.name || email || "G")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "G";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-gradient-to-b from-emerald-500 to-emerald-700 text-xs font-bold text-white shadow-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-white p-1.5 shadow-xl">
            <div className="border-b border-border px-3 py-2.5">
              <p className="truncate text-xs font-bold text-foreground">{user?.name || "GramUdaan User"}</p>
              {email ? <p className="truncate text-[11px] text-muted-foreground">{email}</p> : null}
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Settings className="h-4 w-4 text-muted-foreground" /> Profile & Settings
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Home className="h-4 w-4 text-muted-foreground" /> Landing Page
            </button>
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * MOBILE SLIDE-IN DRAWER (hamburger + “More”)
 * ──────────────────────────────────────────────────────────────────────────── */
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { business, location, subCategory } = useOnboarding();

  const handleSignOut = async () => {
    onClose();
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    navigate("/");
  };

  return (
    <div className={cn("fixed inset-0 z-[70] lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Link to="/dashboard" onClick={onClose} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Globe className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-foreground">
              Gram<span className="text-emerald-700">Udaan</span>
            </span>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {(business || location) && (
            <Link
              to="/settings"
              onClick={onClose}
              className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
                {business?.icon ?? "📍"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-foreground">
                  {business ? business.name + (subCategory ? ` · ${subCategory.name}` : "") : "No business selected"}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {location ? `${location.name}, ${location.district}` : "No location set"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-emerald-700" />
            </Link>
          )}
          <NavSectionList onClick={onClose} />
        </div>

        <div className="border-t border-border p-3">
          <Link
            to="/onboarding"
            onClick={onClose}
            className="mb-2 flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" />
            New / Edit Assessment
          </Link>
          <div className="grid grid-cols-2 gap-1.5 text-xs font-medium">
            <button
              onClick={() => {
                onClose();
                navigate("/settings");
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-muted-foreground hover:bg-muted"
            >
              <Settings className="h-3.5 w-3.5" /> Settings
            </button>
            <button
              onClick={() => {
                onClose();
                navigate("/");
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-muted-foreground hover:bg-muted"
            >
              <Home className="h-3.5 w-3.5" /> Landing
            </button>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * MOBILE BOTTOM NAVIGATION
 * ──────────────────────────────────────────────────────────────────────────── */
const BOTTOM_NAV: (NavItem | { label: string; more: true })[] = [
  { label: "Home", to: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Advisor", to: "/advisor", icon: Bot },
  { label: "Finance", to: "/finance", icon: Wallet },
  { label: "Market", to: "/market", icon: MapPin },
  { label: "Schemes", to: "/schemes", icon: Landmark },
];

function BottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="grid grid-cols-6">
        {BOTTOM_NAV.map((item) => {
          if ("more" in item) return null;
          const Icon = item.icon!;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors",
                  isActive ? "text-emerald-700" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", isActive && "bg-emerald-600/10")}>
                    <Icon className="h-[19px] w-[19px]" />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
          aria-label="More options"
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full">
            <MoreHorizontal className="h-[19px] w-[19px]" />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * APP SHELL
 * ──────────────────────────────────────────────────────────────────────────── */
export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes (browser back / deep links).
  useEffect(() => {
    setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  const handleNav = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen bg-[#f7f9f6] text-foreground">
      {/* ── Top app header ── */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-white/95 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
          {/* Hamburger (mobile/tablet) */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo */}
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Globe className="h-4 w-4" />
            </span>
            <span className="hidden text-lg font-bold tracking-tight text-foreground sm:block">
              Gram<span className="text-emerald-700">Udaan</span>
            </span>
          </Link>

          <div className="mx-1 hidden h-6 w-px bg-border md:block" />

          {/* Business / location context */}
          <ContextChip />

          <div className="flex-1" />

          {/* Online status */}
          <span
            title="GramUdaan services online"
            className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 md:flex"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Online
          </span>

          {/* New assessment */}
          <Link
            to="/onboarding"
            className="hidden items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 md:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5" />
            New Assessment
          </Link>

          {/* Help → reports hub (kept small) */}
          <Link
            to="/advisor"
            aria-label="AI Business Advisor"
            title="AI Business Advisor"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-emerald-300 hover:text-emerald-700 sm:flex"
          >
            <HelpCircle className="h-4 w-4" />
          </Link>

          {/* Account */}
          <UserMenu />
        </div>
      </header>

      <div className="flex">
        {/* ── Desktop sidebar ── */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-white/70 px-3 py-5 lg:flex">
          <NavSectionList onClick={handleNav} />
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Account
            </p>
            <NavRow item={{ label: "Profile & Settings", to: "/settings", icon: Settings, exact: true }} onClick={handleNav} />
            <NavRow item={{ label: "Back to Landing", to: "/", icon: Home, exact: true }} onClick={handleNav} />
          </div>
          <div className="mt-auto pt-6">
            <Link
              to="/onboarding"
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700"
            >
              <Sparkles className="h-4 w-4" />
              New / Edit Assessment
            </Link>
            <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
              One analysis powers every module below.
            </p>
          </div>
        </aside>

        {/* ── Active module ── */}
        <main className="min-w-0 flex-1 px-3 pb-28 pt-5 sm:px-5 sm:pt-7 lg:pb-12 lg:pl-8 lg:pr-8">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <BottomNav onMore={() => setDrawerOpen(true)} />
      {/* ── Mobile drawer ── */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
