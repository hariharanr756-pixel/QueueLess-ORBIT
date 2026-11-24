import { useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  Calendar,
  Compass,
  Cpu,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Sliders,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { useOrbit, type WorkspaceTab } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import { AdminDashboard } from './AdminDashboard.tsx';
import { StaffDashboard } from './StaffDashboard.tsx';
import { PatientDashboard } from './PatientDashboard.tsx';
import { IntelligenceView } from './IntelligenceView.tsx';
import { SimulationStudio } from './SimulationStudio.tsx';
import { DemoGuidePanel } from './DemoGuidePanel.tsx';
import type { UserRole } from '../../shared/types.ts';

export function WorkspaceShell() {
  const {
    user,
    snapshot,
    activeTab,
    setActiveTab,
    setRoute,
    logout,
    launchDemoRole,
    wsStatus,
    lastSyncEvent,
    demoProgress,
    applySnapshot,
  } = useOrbit();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoGuideOpen, setDemoGuideOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  if (!user) return null;

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> =
    user.role === 'patient'
      ? [
          { id: 'overview', label: 'My Digital Token', icon: LayoutDashboard },
          { id: 'appointments', label: 'Book Appointment', icon: Calendar },
          { id: 'intelligence', label: 'ORBIT Transparency', icon: Cpu },
        ]
      : user.role === 'staff'
      ? [
          { id: 'overview', label: 'Staff Queue Desk', icon: Stethoscope },
          { id: 'intelligence', label: 'AI Intelligence', icon: Cpu },
          { id: 'simulation', label: 'Simulation Studio', icon: Sliders },
        ]
      : [
          { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
          { id: 'queue', label: 'Staff Queue Desk', icon: Users },
          { id: 'simulation', label: 'Simulation Studio', icon: Sliders },
          { id: 'intelligence', label: 'AI Intelligence', icon: Cpu },
          { id: 'resources', label: 'Hospital Resources', icon: Building2 },
        ];

  const visibleNotifs = (snapshot?.notifications || []).filter(
    (n) =>
      n.targetRole === 'all' ||
      n.targetRole === user.role ||
      (user.patientId && n.targetPatientId === user.patientId)
  );
  const unreadCount = visibleNotifs.filter((n) => !n.read).length;
  const completedDemoSteps = Object.values(demoProgress).filter(Boolean).length;

  const handleMarkNotifsRead = async () => {
    try {
      const { snapshot: updated } = await orbitApi.markNotificationsRead();
      applySnapshot(updated);
    } catch {
      // ignore
    }
  };

  const renderMainContent = () => {
    if (activeTab === 'intelligence') return <IntelligenceView />;
    if (activeTab === 'simulation') return <SimulationStudio />;

    if (user.role === 'patient') {
      return <PatientDashboard />;
    }
    if (user.role === 'staff') {
      return <StaffDashboard />;
    }
    if (activeTab === 'queue') {
      return <StaffDashboard />;
    }
    return <AdminDashboard />;
  };

  const roleBadgeLabel =
    user.role === 'admin'
      ? 'Administrator'
      : user.role === 'staff'
      ? 'Hospital Staff'
      : 'Patient';

  return (
    <div className="min-h-screen orbit-cosmic-bg text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-indigo-500/20 bg-[#060A18]/90 backdrop-blur-xl shrink-0">
        <div className="flex h-16 items-center justify-between px-5 border-b border-indigo-500/20">
          <button
            type="button"
            onClick={() => setRoute('landing')}
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-white whitespace-nowrap"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/40 bg-violet-600/25 text-cyan-300 text-xs font-extrabold">
              +
            </span>
            <span>
              QueueLess <span className="text-cyan-300">ORBIT</span>
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          <nav aria-label="Workspace navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-violet-600/30 to-cyan-500/15 text-white border border-violet-400/40 shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                      : 'text-slate-400 hover:bg-indigo-500/10 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-cyan-300' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Instant Role Switcher for Synchronized Demo */}
          <div className="rounded-xl border border-indigo-400/20 bg-[#0A1026]/80 p-3.5 space-y-2.5">
            <div className="text-[11px] font-medium text-slate-400">
              Switch Demo Role (Live Sync)
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['admin', 'Admin'],
                  ['staff', 'Staff'],
                  ['patient', 'Patient'],
                ] as Array<[UserRole, string]>
              ).map(([r, label]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => launchDemoRole(r, 'overview')}
                  className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    user.role === r && user.isDemo
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white font-semibold'
                      : 'border border-indigo-400/20 bg-[#070B1C] text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 3-Minute Demo Script Trigger */}
          <button
            type="button"
            onClick={() => setDemoGuideOpen(true)}
            className="w-full rounded-xl border border-cyan-400/30 bg-cyan-950/30 p-3.5 text-left hover:border-cyan-400/60 transition-colors"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-cyan-300">
              <span className="inline-flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5" />
                3-Min Demo Guide
              </span>
              <span className="font-mono-num">{completedDemoSteps}/8</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Step-by-step interactive walkthrough & baseline reset
            </p>
          </button>
        </div>

        {/* User Footer */}
        <div className="border-t border-indigo-500/20 p-4 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-white truncate">{user.name}</div>
            <div className="text-slate-400 truncate">
              {roleBadgeLabel} {user.isDemo ? '· Demo' : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRoute('landing')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-400/25 bg-[#0A1026] py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-400/50 hover:text-white"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-400/25 bg-[#0A1026] py-1.5 text-xs font-medium text-slate-300 hover:border-rose-400/50 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-black/60 backdrop-blur-sm">
          <div className="flex w-72 flex-col bg-[#070B1E] border-r border-indigo-500/25 p-4 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-white">
                QueueLess <span className="text-cyan-300">ORBIT</span>
              </span>
              <button
                type="button"
                aria-label="Close sidebar"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg border border-indigo-400/30 p-1.5 text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      active ? 'bg-violet-600/25 text-white border border-violet-400/40' : 'text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-indigo-500/20 pt-4 space-y-2">
              <div className="text-xs text-slate-400">Switch Demo Role</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['admin', 'staff', 'patient'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      launchDemoRole(r, 'overview');
                      setSidebarOpen(false);
                    }}
                    className="rounded-lg border border-indigo-400/25 bg-[#0B112B] py-1.5 text-xs capitalize text-slate-200"
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  setDemoGuideOpen(true);
                }}
                className="w-full rounded-lg border border-cyan-400/35 bg-cyan-950/40 py-2 text-xs font-semibold text-cyan-300"
              >
                Open 3-Min Demo Guide ({completedDemoSteps}/8)
              </button>
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-lg border border-indigo-400/25 py-2 text-xs text-slate-300"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Contextual Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-indigo-500/20 bg-[#060A18]/85 backdrop-blur-xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden rounded-lg border border-indigo-400/30 p-2 text-slate-300"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="truncate text-xs sm:text-sm text-slate-400">
              <span>QueueLess ORBIT</span>
              <span className="mx-2 text-slate-600">/</span>
              <span className="text-white font-medium">{roleBadgeLabel}</span>
              <span className="hidden sm:inline mx-2 text-slate-600">/</span>
              <span className="hidden sm:inline text-cyan-300 font-medium capitalize">
                {activeTab === 'overview' ? 'Dashboard' : activeTab}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Real WebSocket Sync Status */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300"
              title="Live WebSocket synchronization status"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : wsStatus === 'connecting'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
              />
              <span className="whitespace-nowrap">
                {wsStatus === 'connected' ? 'Live Sync' : 'Reconnecting'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDemoGuideOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-[#0B1026] px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/60 hover:text-white whitespace-nowrap shrink-0"
            >
              <Compass className="h-3.5 w-3.5 text-cyan-300" />
              Demo Script ({completedDemoSteps}/8)
            </button>

            {/* Notifications Trigger */}
            <div className="relative">
              <button
                type="button"
                aria-label="Open notifications"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  if (!notifOpen && unreadCount > 0) {
                    handleMarkNotifsRead();
                  }
                }}
                className="relative rounded-full border border-indigo-400/30 bg-[#0B1026] p-2 text-slate-300 hover:text-white hover:border-cyan-400/50"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 px-1 font-mono-num text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="orbit-glass absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl p-4 shadow-2xl z-40">
                  <div className="flex items-center justify-between border-b border-indigo-400/20 pb-2.5">
                    <span className="font-display text-sm font-semibold text-white">
                      Real-Time Notifications
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
                    {visibleNotifs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">No notifications.</p>
                    ) : (
                      visibleNotifs.slice(0, 12).map((n) => (
                        <div
                          key={n.id}
                          className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/90 p-3 text-xs"
                        >
                          <div className="font-semibold text-white">{n.title}</div>
                          <p className="mt-0.5 text-slate-300">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Live WebSocket Event Toast Banner */}
        {lastSyncEvent && (
          <div className="border-b border-cyan-400/25 bg-cyan-950/35 px-4 sm:px-6 lg:px-8 py-2 text-xs text-cyan-200 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
            <span>{lastSyncEvent}</span>
          </div>
        )}

        {/* Active Dashboard Body */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {renderMainContent()}
        </main>
      </div>

      {/* Interactive 3-Minute Demo Guide Drawer */}
      <DemoGuidePanel open={demoGuideOpen} onClose={() => setDemoGuideOpen(false)} />
    </div>
  );
}
