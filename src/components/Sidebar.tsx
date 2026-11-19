import {
  BookOpenCheck,
  CalendarCheck2,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Layers,
  Package,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { CompanyBrandingConfig, NavSection, Role, TeamMember } from '../types/nexops';

interface SidebarProps {
  branding: CompanyBrandingConfig;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  activeRole: Role;
  currentUser: TeamMember;
  pendingQueueCount: number;
  activeProjectsCount?: number;
  assetAlertsCount?: number;
  pendingSopsCount?: number;
  pendingLeavesCount?: number;
  openActionItemsCount?: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  branding,
  activeSection,
  onSelectSection,
  activeRole,
  currentUser,
  pendingQueueCount,
  activeProjectsCount,
  assetAlertsCount,
  pendingSopsCount,
  pendingLeavesCount,
  openActionItemsCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {

  const navItems: {
    id: NavSection;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
    adminNotice?: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: 'Executive KPIs',
      icon: LayoutDashboard,
    },
    {
      id: 'requests',
      label: 'Requests & Queue',
      icon: ClipboardCheck,
      badge: pendingQueueCount,
    },
    {
      id: 'projects',
      label: 'Projects & Clients',
      icon: FolderKanban,
      badge: activeProjectsCount,
    },
    {
      id: 'assets',
      label: 'Assets & Inventory',
      icon: Package,
      badge: assetAlertsCount,
    },
    {
      id: 'sops',
      label: 'SOP & Policy Vault',
      icon: BookOpenCheck,
      badge: pendingSopsCount,
    },
    {
      id: 'leaves',
      label: 'Leaves & Time-Off',
      icon: CalendarCheck2,
      badge: pendingLeavesCount,
    },
    {
      id: 'meetings',
      label: 'Meetings & MoM',
      icon: CalendarClock,
      badge: openActionItemsCount,
    },
    {
      id: 'audit',
      label: 'Audit & Compliance',
      icon: FileSpreadsheet,
    },
    {
      id: 'settings',
      label: 'Team & Settings',
      icon: Users,
      adminNotice: activeRole !== 'Admin',
    },
  ];

  const handleNavigate = (section: NavSection) => {
    onSelectSection(section);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Brand Lockup */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Layers className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block truncate font-display text-sm font-bold tracking-tight text-white">
              {branding.companyName}
            </span>
            <span className="block truncate text-[11px] font-medium text-slate-400">
              {branding.tagline}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Primary Sidebar Navigation">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400">
          Workspace Modules
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-indigo-400 ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 truncate">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className={`ml-2 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                    isActive
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {item.adminNotice && (
                <ShieldAlert
                  className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-500"
                  aria-label="Admin role required for edits"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Active Role Summary Footer */}
      <div className="border-t border-slate-800 p-4">
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-slate-400">Active Session</p>
            <span className="font-mono text-[10px] text-slate-400 tabular-nums">
              {currentUser.employeeId}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{currentUser.name}</p>
          <p className="mt-0.5 truncate text-xs text-indigo-300">
            {currentUser.signOffTitle || activeRole}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{activeRole}</p>
          {currentUser.outOfOffice && (
            <p className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              OOO → {currentUser.delegateApproverName || 'Delegate Active'}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64 lg:border-r lg:border-slate-800">
        {sidebarContent}
      </aside>

      {/* Mobile Collapsible Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[82vw] border-r border-slate-800 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
