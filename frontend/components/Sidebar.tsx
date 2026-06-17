"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  ScanSearch,
  TrendingUp,
  Target,
  FlaskConical,
  PieChart,
  ShieldAlert,
  Activity,
  Zap,
  RotateCcw,
  Crosshair,
  AlignCenter,
  CalendarDays,
  BarChart3,
  Star,
  Gauge,
  Network,
  Waves,
  Globe,
  Layers,
  Percent,
  GitCompare,
  MonitorDot,
  SigmaSquare,
  Radar,
  Landmark,
  Users,
  Milestone,
  LogIn,
  LogOut,
  UserCircle,
  Wand2,
  BellRing,
  FileDown,
  DollarSign,
  FlameKindling,
  Menu,
  X,
  ChevronRight,
  Droplets,
  TrendingDown,
  Banknote,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { href: string; label: string; icon: React.ElementType };
type Section = { label: string; items: NavItem[] };

const SECTIONS: Section[] = [
  {
    label: "MACRO & GLOBAL",
    items: [
      { href: "/",            label: "Overview",       icon: LayoutDashboard },
      { href: "/macro",       label: "Macro",          icon: Globe },
      { href: "/country-macro", label: "Country Macro", icon: Globe },
      { href: "/regime",      label: "Regime",         icon: Radar },
      { href: "/crude-oil",   label: "Crude Oil",      icon: Droplets },
      { href: "/dxy",         label: "US Dollar (DXY)", icon: DollarSign },
      { href: "/treasuries",  label: "Treasuries",     icon: Banknote },
    ],
  },
  {
    label: "EQUITIES",
    items: [
      { href: "/watchlist",    label: "Watchlist",     icon: Star },
      { href: "/rotation",     label: "Sector Rotation", icon: RotateCcw },
      { href: "/breadth",      label: "Breadth",       icon: Gauge },
      { href: "/rs",           label: "RS Rankings",   icon: BarChart3 },
      { href: "/screener",     label: "Screener",      icon: ScanSearch },
      { href: "/crowding",     label: "Crowding",      icon: Users },
      { href: "/institutional", label: "Inst. Flow",   icon: Landmark },
      { href: "/smart-money",  label: "Smart Money",   icon: TrendingDown },
    ],
  },
  {
    label: "ANALYTICS & SIGNALS",
    items: [
      { href: "/setups",          label: "Setups",          icon: Zap },
      { href: "/prebreakout",     label: "Pre-Breakout",    icon: Crosshair },
      { href: "/mtf",             label: "Multi-TF",        icon: AlignCenter },
      { href: "/alpha-engine",    label: "Alpha Engine",    icon: FlameKindling },
      { href: "/factors",         label: "Factors",         icon: TrendingUp },
      { href: "/expected-return", label: "Exp. Return",     icon: Target },
      { href: "/intraday",        label: "ST Signals",      icon: Activity },
      { href: "/volatility",      label: "Volatility",      icon: Waves },
      { href: "/correlations",    label: "Correlations",    icon: Network },
      { href: "/options-analytics", label: "Options",       icon: Percent },
      { href: "/earnings",        label: "Earnings",        icon: CalendarDays },
      { href: "/earnings-drift",  label: "Earnings Drift",  icon: Milestone },
      { href: "/pairs",           label: "Pair Trading",    icon: GitCompare },
    ],
  },
  {
    label: "PORTFOLIO & RISK",
    items: [
      { href: "/portfolio",        label: "Portfolio",        icon: PieChart },
      { href: "/risk",             label: "Risk",             icon: ShieldAlert },
      { href: "/risk-engine",      label: "Risk Engine",      icon: Layers },
      { href: "/risk-model",       label: "PCA Risk Model",   icon: SigmaSquare },
      { href: "/backtest",         label: "Backtester",       icon: FlaskConical },
      { href: "/strategy-builder", label: "Strategy Builder", icon: Wand2 },
      { href: "/alerts",           label: "Alerts",           icon: BellRing },
      { href: "/reports",          label: "Reports",          icon: FileDown },
      { href: "/mt5",              label: "MT5 Terminal",     icon: MonitorDot },
    ],
  },
];

function SidebarSection({
  section,
  pathname,
  defaultOpen,
}: {
  section: Section;
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Re-open if active route is inside this section
  useEffect(() => {
    if (section.items.some((i) => i.href === pathname)) {
      setOpen(true);
    }
  }, [pathname, section.items]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 mt-1 group"
      >
        <span className="text-[10px] font-semibold tracking-widest text-text-muted/60 group-hover:text-text-muted transition-colors">
          {section.label}
        </span>
        <ChevronRight
          size={11}
          className={cn(
            "text-text-muted/40 transition-transform duration-200 group-hover:text-text-muted",
            open && "rotate-90"
          )}
        />
      </button>

      {/* Animated collapse using CSS grid trick */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 pb-1">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors",
                    active
                      ? "bg-surface-2 text-text-primary"
                      : "text-text-muted hover:text-text-primary hover:bg-surface-2"
                  )}
                >
                  <Icon size={13} strokeWidth={active ? 2.5 : 1.8} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "md:hidden fixed top-3 left-3 z-50 p-2 rounded-md",
          "bg-surface border border-border text-text-muted hover:text-text-primary transition-colors",
          isOpen && "hidden"
        )}
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r border-border bg-surface",
          "transition-transform duration-300 ease-in-out",
          "md:relative md:w-52 md:shrink-0 md:translate-x-0 md:transition-none",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <span className="text-sm font-semibold tracking-widest text-accent uppercase">
              Quant
            </span>
            <span className="text-sm font-semibold tracking-widest text-text-muted uppercase">
              Desk
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 rounded text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sectioned nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {SECTIONS.map((section) => (
            <SidebarSection
              key={section.label}
              section={section}
              pathname={pathname}
              defaultOpen
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-border space-y-2 shrink-0">
          {!loading && (
            user ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <UserCircle size={14} className="text-accent shrink-0" />
                  <span className="text-xs text-text-muted truncate" title={user.email}>
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                <LogIn size={13} />
                Sign in
              </Link>
            )
          )}
          <div className="text-xs text-text-muted px-2">Data: yfinance</div>
        </div>
      </aside>
    </>
  );
}
