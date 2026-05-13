/* ============================================================
   DashboardLayout — ErgoKit Clinical Dashboard
   Fixed 240px left sidebar (deep navy) + sticky top bar + main content
   ============================================================ */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  HelpCircle,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: ClipboardList, label: "Assessments", href: "/assessments" },
  { icon: BarChart3, label: "Reports", href: "/reports" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? "w-16" : "w-60";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative z-50 flex flex-col h-full transition-all duration-200 ease-out",
          sidebarWidth,
          "bg-[oklch(0.28_0.07_240)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[oklch(0.35_0.07_240)]">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[oklch(0.62_0.18_220)] flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-white font-semibold text-sm leading-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                ErgoKit
              </p>
              <p className="text-[oklch(0.65_0.03_240)] text-xs leading-tight">
                Ergonomics Platform
              </p>
            </div>
          )}
        </div>

        {/* New Assessment CTA */}
        {!collapsed && (
          <div className="px-3 pt-4 pb-2">
            <Link href="/assessments/new">
              <Button
                size="sm"
                className="w-full bg-[oklch(0.62_0.18_220)] hover:bg-[oklch(0.55_0.18_220)] text-white gap-2 text-xs font-medium"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                <Plus className="w-3.5 h-3.5" />
                New Assessment
              </Button>
            </Link>
          </div>
        )}
        {collapsed && (
          <div className="px-2 pt-4 pb-2">
            <Link href="/assessments/new">
              <Button
                size="icon"
                className="w-full h-8 bg-[oklch(0.62_0.18_220)] hover:bg-[oklch(0.55_0.18_220)] text-white"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer",
                    isActive
                      ? "bg-[oklch(0.62_0.18_220)] text-white"
                      : "text-[oklch(0.75_0.02_240)] hover:bg-[oklch(0.35_0.07_240)] hover:text-white"
                  )}
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom help */}
        <div className="px-2 pb-4 border-t border-[oklch(0.35_0.07_240)] pt-3">
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-[oklch(0.65_0.03_240)] hover:bg-[oklch(0.35_0.07_240)] hover:text-white transition-all duration-150 cursor-pointer"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <HelpCircle className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Help & Docs</span>}
          </div>
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-border shadow-sm items-center justify-center hover:bg-muted transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="flex-shrink-0 h-14 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Breadcrumb location={location} />
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              <span className="text-xs font-medium text-amber-700" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                2 High Risk
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[oklch(0.28_0.07_240)] flex items-center justify-center text-white text-xs font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              SC
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function Breadcrumb({ location }: { location: string }) {
  const crumbs: Record<string, string> = {
    "/": "Dashboard",
    "/assessments": "Assessments",
    "/assessments/new": "New Assessment",
    "/reports": "Reports",
    "/settings": "Settings",
  };

  const label = Object.entries(crumbs)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => location === path || location.startsWith(path + "/"))?.[1] ?? "ErgoKit";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>ErgoKit</span>
      <span className="text-xs text-muted-foreground">/</span>
      <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
    </div>
  );
}
