/**
 * DashboardLayout — ErgoKit CV Platform
 * Dark navy sidebar + main content area.
 * Nav: Dashboard | Task Setup | Live Scan | Sessions
 */
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Settings2, Camera, ClipboardList,
  Activity, Wifi, WifiOff, Menu, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/contexts/SessionContext';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/setup', label: 'Task Setup', icon: Settings2 },
  { href: '/scan', label: 'Live Scan', icon: Camera },
  { href: '/sessions', label: 'Sessions', icon: ClipboardList },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isRecording, sessionDuration } = useSession();

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:relative z-50 flex flex-col h-full transition-all duration-200 ease-out',
        collapsed ? 'w-16' : 'w-56',
        'bg-[oklch(0.14_0.03_240)] border-r border-[oklch(0.20_0.04_240)]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[oklch(0.20_0.04_240)]">
          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-[oklch(0.62_0.18_220)] flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-white leading-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>ErgoKit</p>
              <p className="text-xs text-slate-400 leading-tight">CV Ergonomics</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-[oklch(0.62_0.18_220)] text-white'
                    : 'text-slate-300 hover:bg-[oklch(0.20_0.04_240)] hover:text-white',
                )} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{label}</span>
                      {href === '/scan' && isRecording && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                          <span className="text-xs font-mono text-red-300">
                            {String(Math.floor(sessionDuration / 60)).padStart(2, '0')}:{String(sessionDuration % 60).padStart(2, '0')}
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Network status */}
        <div className="px-2 pb-3 border-t border-[oklch(0.20_0.04_240)] pt-3">
          <div className={cn(
            'flex items-center gap-2 px-2 py-2 rounded-lg bg-[oklch(0.18_0.04_240)]',
            collapsed && 'justify-center',
          )}>
            {isOnline
              ? <Wifi className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              : <WifiOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            }
            {!collapsed && (
              <div>
                <p className="text-xs font-medium text-slate-200" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {isOnline ? 'Online' : 'Offline Mode'}
                </p>
                <p className="text-xs text-slate-500">{isOnline ? 'Model loading enabled' : '100% Air-Gapped'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-border shadow-sm items-center justify-center hover:bg-muted transition-colors z-10"
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
            : <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          }
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background lg:hidden">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[oklch(0.62_0.18_220)]" />
            <span className="text-sm font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>ErgoKit</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
