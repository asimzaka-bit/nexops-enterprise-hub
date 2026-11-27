import {
  BookOpenCheck,
  Briefcase,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FolderKanban,
  FolderLock,
  LayoutDashboard,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CompanyBrandingConfig,
  NavSection,
  Role,
  TeamMember,
  WorkspaceToolType,
} from '../types/nexops';
import type { ViewportInfo } from '../hooks/useViewport';
import {
  GmailColorIcon,
  GoogleDocsColorIcon,
  GoogleFormsColorIcon,
  GoogleSheetsColorIcon,
} from './GoogleWorkspaceIcons';
import { NexOpsLogo } from './NexOpsLogo';
import { UserAvatar } from './UserAvatar';

interface SidebarProps {
  branding: CompanyBrandingConfig;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  activeWorkspaceTool: WorkspaceToolType;
  onSelectWorkspaceTool: (tool: WorkspaceToolType) => void;
  activeRole: Role;
  currentUser: TeamMember;
  pendingQueueCount: number;
  activeProjectsCount?: number;
  assetAlertsCount?: number;
  pendingSopsCount?: number;
  vaultCount?: number;
  pendingLeavesCount?: number;
  openActionItemsCount?: number;
  upcomingCalendarCount?: number;
  unreadCommsCount?: number;
  workspaceLinksCount?: number;
  pendingUsersCount?: number;
  pendingEditorChangesCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  viewport?: ViewportInfo;
}

const WORKSPACE_SUB_TOOLS: {
  id: WorkspaceToolType;
  label: string;
  renderIcon: (className?: string) => ReactNode;
}[] = [
  { id: 'gmail', label: 'Gmail', renderIcon: (cls) => <GmailColorIcon className={cls} /> },
  {
    id: 'docs',
    label: 'Google Docs',
    renderIcon: (cls) => <GoogleDocsColorIcon className={cls} />,
  },
  {
    id: 'sheets',
    label: 'Google Sheets',
    renderIcon: (cls) => <GoogleSheetsColorIcon className={cls} />,
  },
  {
    id: 'forms',
    label: 'Google Forms',
    renderIcon: (cls) => <GoogleFormsColorIcon className={cls} />,
  },
];

export function Sidebar({
  branding,
  activeSection,
  onSelectSection,
  activeWorkspaceTool,
  onSelectWorkspaceTool,
  activeRole,
  currentUser,
  pendingQueueCount,
  activeProjectsCount,
  assetAlertsCount,
  pendingSopsCount,
  vaultCount,
  pendingLeavesCount,
  openActionItemsCount,
  upcomingCalendarCount,
  unreadCommsCount,
  workspaceLinksCount,
  pendingUsersCount,
  pendingEditorChangesCount,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  viewport,
}: SidebarProps) {
  const showDesktopFixedSidebar = viewport ? viewport.isDesktop : true;
  const showDrawerMode = viewport ? !viewport.isDesktop : true;
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
      id: 'vault',
      label: 'Document Vault',
      icon: FolderLock,
      badge: vaultCount,
    },
    {
      id: 'leaves',
      label: 'Attendance & Leaves',
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
      id: 'calendar',
      label: 'Calendar',
      icon: CalendarDays,
      badge: upcomingCalendarCount,
    },
    {
      id: 'mailchat',
      label: 'Mail & Chat',
      icon: MessageSquare,
      badge: unreadCommsCount,
    },
    {
      id: 'user_settings',
      label: 'Settings',
      icon: Settings,
    },
    ...(activeRole === 'Admin'
      ? [
          {
            id: 'audit' as NavSection,
            label: 'Audit Trail',
            icon: FileSpreadsheet,
          },
          {
            id: 'settings' as NavSection,
            label: 'Admin Panel & Settings',
            icon: Users,
            badge: (pendingUsersCount ?? 0) + (pendingEditorChangesCount ?? 0),
          },
        ]
      : []),
  ];

  const handleNavigate = (section: NavSection) => {
    onSelectSection(section);
    onCloseMobile();
  };

  const handleNavigateWorkspaceTool = (tool: WorkspaceToolType) => {
    onSelectWorkspaceTool(tool);
    onSelectSection('workspace');
    onCloseMobile();
  };

  const renderSidebarContent = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Brand Lockup & Collapse Toggle */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-slate-800 bg-slate-900 ${
          isCollapsed ? 'justify-center gap-1 px-2' : 'justify-between gap-2 px-3.5'
        }`}
      >
        {isCollapsed ? (
          <div
            className="flex shrink-0 items-center justify-center"
            title={branding.companyName}
          >
            <NexOpsLogo size={30} surface="dark" title={branding.companyName} />
          </div>
        ) : (
          <NexOpsLogo
            size={34}
            showWordmark
            layout="horizontal"
            surface="dark"
            title={branding.companyName}
            tagline={branding.tagline}
            className="min-w-0 flex-1"
          />
        )}

        <div className="flex shrink-0 items-center gap-1">
          {/* Desktop Collapse / Expand Toggle Button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            className={`hidden items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:inline-flex ${
              isCollapsed ? 'h-7 w-7' : 'h-8 w-8'
            }`}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          {/* Mobile Drawer Close Button */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        className={`flex-1 space-y-1 py-4 ${isCollapsed ? 'px-2 overflow-visible' : 'px-3 overflow-y-auto'}`}
        aria-label="Primary Sidebar Navigation"
      >
        {!isCollapsed && (
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
            Workspace Modules
          </p>
        )}

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`group relative flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-indigo-400 ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
              } ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-3 truncate'}`}>
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  aria-hidden="true"
                />
                {!isCollapsed && (
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                )}
              </span>

              {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
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

              {isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-indigo-400" />
              )}

              {!isCollapsed && item.adminNotice && (
                <ShieldAlert
                  className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-500"
                  aria-label="Admin role required for edits"
                />
              )}

              {/* Hover Tooltip when Collapsed */}
              {isCollapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full z-50 ml-3 hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shadow-xl group-hover:flex"
                >
                  <span>{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="rounded bg-indigo-600 px-1.5 py-0.5 font-mono text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}

        {/* Dedicated Unified Workspace Section (Gmail, Google Docs, Google Sheets, Google Forms) */}
        <div className="pt-3 mt-3 border-t border-slate-800/80">
          {!isCollapsed ? (
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
              Google Workspace
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => handleNavigate('workspace')}
            title={isCollapsed ? 'Workspace' : undefined}
            className={`group relative flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-indigo-400 ${
              isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
            } ${
              activeSection === 'workspace'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className={`flex items-center ${isCollapsed ? '' : 'gap-3 truncate'}`}>
              <Briefcase
                className={`h-4 w-4 shrink-0 ${
                  activeSection === 'workspace'
                    ? 'text-white'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
                aria-hidden="true"
              />
              {!isCollapsed && (
                <span className="truncate whitespace-nowrap">Workspace</span>
              )}
            </span>

            {!isCollapsed && typeof workspaceLinksCount === 'number' && workspaceLinksCount > 0 && (
              <span
                className={`ml-2 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  activeSection === 'workspace'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {workspaceLinksCount}
              </span>
            )}

            {isCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full z-50 ml-3 hidden rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shadow-xl group-hover:flex"
              >
                Workspace (Gmail, Docs, Sheets, Forms)
              </span>
            )}
          </button>

          {/* 4 Integrated Workspace Tools Sub-Items */}
          <div className={`mt-1 space-y-0.5 ${isCollapsed ? '' : 'pl-3'}`}>
            {WORKSPACE_SUB_TOOLS.map((tool) => {
              const isToolActive =
                activeSection === 'workspace' && activeWorkspaceTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleNavigateWorkspaceTool(tool.id)}
                  title={isCollapsed ? tool.label : undefined}
                  className={`group relative flex w-full items-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
                  } ${
                    isToolActive
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {tool.renderIcon('h-4 w-4')}
                  </span>
                  {!isCollapsed && <span className="truncate">{tool.label}</span>}

                  {isCollapsed && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-full z-50 ml-3 hidden rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shadow-xl group-hover:flex"
                    >
                      {tool.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Active Role Summary Footer with Profile Avatar */}
      <div className={`border-t border-slate-800 ${isCollapsed ? 'p-2.5' : 'p-4'}`}>
        {isCollapsed ? (
          <div className="group relative flex justify-center">
            <UserAvatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
              sizeClass="h-9 w-9"
              textClass="text-xs"
              roundedClass="rounded-lg"
              className="border-slate-700"
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-1 left-full z-50 ml-3 hidden rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-xs text-white whitespace-nowrap shadow-xl group-hover:block"
            >
              <span className="block font-semibold">{currentUser.name}</span>
              <span className="block text-[11px] text-indigo-300">
                {currentUser.signOffTitle || activeRole}
              </span>
              <span className="block text-[10px] text-slate-400">{activeRole}</span>
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-3">
            <div className="flex items-center gap-2.5">
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                sizeClass="h-9 w-9"
                textClass="text-xs"
                roundedClass="rounded-lg"
                className="border-slate-700"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium text-slate-400">Active Session</p>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {currentUser.employeeId}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-white">
                  {currentUser.name}
                </p>
              </div>
            </div>
            <p className="mt-2 truncate text-xs text-indigo-300">
              {currentUser.signOffTitle || activeRole}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{activeRole}</p>
            {currentUser.outOfOffice && (
              <p className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                OOO → {currentUser.delegateApproverName || 'Delegate Active'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Collapsible Sidebar (>= 1024px) */}
      {showDesktopFixedSidebar && (
        <aside
          className={`gpu-accelerated hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:border-r lg:border-slate-800 transition-all duration-200 ease-in-out ${
            collapsed ? 'lg:w-20' : 'lg:w-64'
          }`}
        >
          {renderSidebarContent(collapsed)}
        </aside>
      )}

      {/* Mobile & Tablet Slide-Over Drawer (< 1024px) */}
      {showDrawerMode && mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="gpu-accelerated fixed inset-y-0 left-0 z-50 w-72 max-w-[calc(100vw-20px)] border-r border-slate-800 shadow-xl">
            {renderSidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
