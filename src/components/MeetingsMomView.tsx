import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  ListChecks,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  Department,
  MeetingActionItem,
  MeetingActionStatus,
  MeetingMinute,
  PendingEditorChange,
  Priority,
  Role,
  TeamMember,
} from '../types/nexops';
import {
  formatDateTime,
  formatShortDate,
  getNextActionTrackerStatus,
  getTodayDateString,
  isActionItemOpen,
  isActionItemOverdue,
  isSuperAdminEmail,
  normalizeActionItemStatus,
} from '../utils/storage';
import { PendingApprovalBadge, PriorityBadge } from './StatusIndicator';

export interface CreateMeetingPayload {
  title: string;
  meetingDate: string;
  department: Department;
  facilitator: string;
  attendees: string[];
  summary: string;
  decisions: string[];
  actionItems: {
    title?: string;
    description: string;
    ownerName: string;
    department: Department;
    priority: Priority;
    dueDate: string;
    status?: MeetingActionStatus;
  }[];
}

interface MeetingsMomViewProps {
  meetings: MeetingMinute[];
  activeRole: Role;
  currentUser: TeamMember;
  pendingEditorChanges?: PendingEditorChange[];
  departments: string[];
  teamMembers: TeamMember[];
  onCreateMeeting: (payload: CreateMeetingPayload) => void;
  onAddActionItem: (
    meetingId: string,
    item: {
      title?: string;
      description: string;
      ownerName: string;
      department: Department;
      priority: Priority;
      dueDate: string;
      status?: MeetingActionStatus;
    },
  ) => void;
  onUpdateActionItemStatus: (
    meetingId: string,
    actionItemId: string,
    nextStatus: MeetingActionStatus,
  ) => void;
  onConvertActionToRequest: (meetingId: string, actionItemId: string) => void;
  onCompleteActionItem: (meetingId: string, actionItemId: string) => void;
  onInspectRequest: (requestId: string) => void;
  onStampMeeting?: (meetingId: string) => void;
  onDeleteMeeting?: (meetingId: string) => void;
}

const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];

function getDefaultDueDate(daysAhead = 5): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function MeetingsMomView({
  meetings,
  activeRole,
  currentUser,
  pendingEditorChanges = [],
  departments,
  teamMembers,
  onCreateMeeting,
  onAddActionItem,
  onUpdateActionItemStatus,
  onConvertActionToRequest,
  onCompleteActionItem,
  onInspectRequest,
  onStampMeeting,
  onDeleteMeeting,
}: MeetingsMomViewProps) {
  const canManage = activeRole === 'Admin' || activeRole === 'Editor';
  const todayStr = getTodayDateString();
  const isAdmin = activeRole === 'Admin';
  const isSuperAdmin = isAdmin && isSuperAdminEmail(currentUser.email);
  const [confirmDeleteMomId, setConfirmDeleteMomId] = useState<string | null>(null);

  const pendingMeetingEditIds = useMemo(() => {
    const set = new Set<string>();
    for (const chg of pendingEditorChanges) {
      if (chg.status === 'pending' && chg.module === 'meetings' && chg.action !== 'create') {
        set.add(chg.targetId);
      }
    }
    return set;
  }, [pendingEditorChanges]);

  const pendingCreatedMeetings = useMemo(() => {
    if (!canManage) return [];
    const emailLower = currentUser.email.toLowerCase();
    return pendingEditorChanges.filter(
      (chg) =>
        chg.status === 'pending' &&
        chg.module === 'meetings' &&
        chg.action === 'create' &&
        (activeRole === 'Admin' || chg.editorEmail.toLowerCase() === emailLower),
    );
  }, [pendingEditorChanges, activeRole, currentUser.email, canManage]);

  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [openActionsOnly, setOpenActionsOnly] = useState(false);

  // Create Meeting Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(getTodayDateString());
  const [department, setDepartment] = useState<Department>(departments[0] ?? 'Operations');
  const [facilitator, setFacilitator] = useState(currentUser.name);
  const [attendeesInput, setAttendeesInput] = useState(currentUser.name);
  const [summary, setSummary] = useState('');
  const [decisions, setDecisions] = useState<string[]>([
    'Approved SLA compliance checklist and owner assignments.',
  ]);
  const [newDecision, setNewDecision] = useState('');
  const [draftActions, setDraftActions] = useState<CreateMeetingPayload['actionItems']>([]);
  const [actTitle, setActTitle] = useState('');
  const [actDesc, setActDesc] = useState('');
  const [actOwner, setActOwner] = useState(currentUser.name);
  const [actDept, setActDept] = useState<Department>(departments[0] ?? 'Operations');
  const [actPriority, setActPriority] = useState<Priority>('High');
  const [actStatus, setActStatus] = useState<'Todo' | 'In Progress' | 'Done'>('Todo');
  const [actDue, setActDue] = useState(getDefaultDueDate(5));
  const [formError, setFormError] = useState<string | null>(null);

  // Inline add-action state per meeting card
  const [addingForMeetingId, setAddingForMeetingId] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');
  const [inlineDesc, setInlineDesc] = useState('');
  const [inlineOwner, setInlineOwner] = useState(currentUser.name);
  const [inlineDept, setInlineDept] = useState<Department>(departments[0] ?? 'Operations');
  const [inlinePriority, setInlinePriority] = useState<Priority>('Medium');
  const [inlineStatus, setInlineStatus] = useState<'Todo' | 'In Progress' | 'Done'>('Todo');
  const [inlineDue, setInlineDue] = useState(getDefaultDueDate(5));

  const availableMembers = useMemo(
    () => teamMembers.filter((m) => m.active).map((m) => m.name),
    [teamMembers],
  );

  const availableDepartments = useMemo(
    () => Array.from(new Set([...departments, ...meetings.map((m) => m.department)])),
    [departments, meetings],
  );

  const metrics = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDecisions = meetings.reduce((sum, m) => sum + m.decisions.length, 0);
    const allActions = meetings.flatMap((m) => m.actionItems);
    const openActions = allActions.filter((a) => isActionItemOpen(a.status)).length;
    const convertedActions = allActions.filter(
      (a) => a.status === 'Converted to Request',
    ).length;
    return { totalMeetings, totalDecisions, openActions, convertedActions };
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return meetings.filter((m) => {
      const matchesDept = deptFilter === 'All' || m.department === deptFilter;
      const matchesOpen =
        !openActionsOnly || m.actionItems.some((a) => isActionItemOpen(a.status));
      const matchesQuery =
        !q ||
        m.code.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.facilitator.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.actionItems.some(
          (a) =>
            (a.title && a.title.toLowerCase().includes(q)) ||
            a.description.toLowerCase().includes(q) ||
            a.ownerName.toLowerCase().includes(q) ||
            (a.linkedRequestId && a.linkedRequestId.toLowerCase().includes(q)),
        );
      return matchesDept && matchesOpen && matchesQuery;
    });
  }, [meetings, searchQuery, deptFilter, openActionsOnly]);

  const handleOpenCreateModal = () => {
    setTitle('');
    setMeetingDate(getTodayDateString());
    setDepartment(availableDepartments[0] ?? 'Operations');
    setFacilitator(currentUser.name);
    setAttendeesInput(
      availableMembers.slice(0, 3).join(', ') || currentUser.name,
    );
    setSummary('');
    setDecisions([]);
    setNewDecision('');
    setDraftActions([]);
    setActTitle('');
    setActDesc('');
    setActOwner(availableMembers[0] || currentUser.name);
    setActDept(availableDepartments[0] ?? 'Operations');
    setActPriority('High');
    setActStatus('Todo');
    setActDue(getDefaultDueDate(5));
    setFormError(null);
    setCreateOpen(true);
  };

  const handleAddDraftDecision = () => {
    const trimmed = newDecision.trim();
    if (!trimmed) return;
    setDecisions((prev) => [...prev, trimmed]);
    setNewDecision('');
  };

  const handleAddDraftAction = () => {
    const cleanTitle = actTitle.trim();
    const cleanDesc = actDesc.trim();
    if (!cleanTitle && !cleanDesc) return;
    setDraftActions((prev) => [
      ...prev,
      {
        title: cleanTitle || undefined,
        description: cleanDesc || cleanTitle,
        ownerName: actOwner.trim() || currentUser.name,
        department: actDept,
        priority: actPriority,
        status: actStatus,
        dueDate: actDue || getDefaultDueDate(5),
      },
    ]);
    setActTitle('');
    setActDesc('');
    setActStatus('Todo');
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Meeting title is required.');
      return;
    }
    if (!summary.trim()) {
      setFormError('Executive meeting summary is required.');
      return;
    }

    const attendees = attendeesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    onCreateMeeting({
      title: title.trim(),
      meetingDate: meetingDate || getTodayDateString(),
      department,
      facilitator: facilitator.trim() || currentUser.name,
      attendees: attendees.length > 0 ? attendees : [currentUser.name],
      summary: summary.trim(),
      decisions,
      actionItems: draftActions,
    });
    setCreateOpen(false);
  };

  const handleInlineAddSubmit = (e: FormEvent, meetingId: string) => {
    e.preventDefault();
    const cleanTitle = inlineTitle.trim();
    const cleanDesc = inlineDesc.trim();
    if (!cleanTitle && !cleanDesc) return;
    onAddActionItem(meetingId, {
      title: cleanTitle || undefined,
      description: cleanDesc || cleanTitle,
      ownerName: inlineOwner.trim() || currentUser.name,
      department: inlineDept,
      priority: inlinePriority,
      status: inlineStatus,
      dueDate: inlineDue || getDefaultDueDate(5),
    });
    setInlineTitle('');
    setInlineDesc('');
    setInlineStatus('Todo');
    setAddingForMeetingId(null);
  };

  const handleStartConvertNoteToAction = (mom: MeetingMinute, noteText: string) => {
    const shortTitle = noteText.trim().slice(0, 72);
    setAddingForMeetingId(mom.id);
    setInlineTitle(shortTitle);
    setInlineDesc(noteText.trim());
    setInlineDept(mom.department);
    setInlineOwner(currentUser.name);
    setInlinePriority('Medium');
    setInlineStatus('Todo');
    setInlineDue(getDefaultDueDate(5));
  };

  const renderActionStatusBadge = (meetingId: string, item: MeetingActionItem) => {
    const normalized = normalizeActionItemStatus(item.status);
    if (normalized === 'Converted to Request') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Send className="h-3 w-3 shrink-0" />
          <span>Tracked Request</span>
        </span>
      );
    }

    const badgeStyle =
      normalized === 'Done'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
        : normalized === 'In Progress'
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300';

    if (canManage) {
      const nextStatus = getNextActionTrackerStatus(item.status);
      return (
        <button
          type="button"
          onClick={() => onUpdateActionItemStatus(meetingId, item.id, nextStatus)}
          title={`Click to change status to ${nextStatus}`}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap transition-opacity hover:opacity-85 ${badgeStyle}`}
        >
          {normalized === 'Done' ? (
            <CheckCircle2 className="h-3 w-3 shrink-0" />
          ) : normalized === 'In Progress' ? (
            <Clock className="h-3 w-3 shrink-0" />
          ) : (
            <ListChecks className="h-3 w-3 shrink-0" />
          )}
          <span>{normalized}</span>
        </button>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${badgeStyle}`}
      >
        {normalized === 'Done' ? (
          <CheckCircle2 className="h-3 w-3 shrink-0" />
        ) : normalized === 'In Progress' ? (
          <Clock className="h-3 w-3 shrink-0" />
        ) : (
          <ListChecks className="h-3 w-3 shrink-0" />
        )}
        <span>{normalized}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Logged Governance Meetings</span>
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {metrics.totalMeetings}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Official executive &amp; ops MoM archive</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Key Decisions Recorded</span>
            <ClipboardList className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {metrics.totalDecisions}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Resolutions documented across sessions</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Action Items</span>
            <ListChecks className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-amber-700 tabular-nums dark:text-amber-400">
            {metrics.openActions}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ready for 1-click request conversion</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Converted to Requests</span>
            <Send className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-indigo-700 tabular-nums dark:text-indigo-400">
            {metrics.convertedActions}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Active in QA &amp; approval workflow queue</p>
        </div>
      </section>

      {!canManage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Viewing Meeting Minutes in read-only mode as <strong>{activeRole}</strong>. Logging new
            MoM records or converting action items to operational requests requires{' '}
            <strong>Editor</strong> or <strong>Admin</strong> permissions.
          </span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px]">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search MoM Code (MOM-2026-014), title, facilitator, action owner..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
            />
          </div>

          <select
            aria-label="Filter meetings by department"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="All">All Departments</option>
            {availableDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={openActionsOnly}
            onClick={() => setOpenActionsOnly((prev) => !prev)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              openActionsOnly
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            <span>Open Action Items Only</span>
          </button>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log Meeting Minutes (MoM)</span>
          </button>
        )}
      </div>

      {/* Pending Maker-Checker Meeting Minutes Proposals */}
      {pendingCreatedMeetings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/70 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <PendingApprovalBadge label={`${pendingCreatedMeetings.length} Pending Super Admin Approval`} />
            <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
              Logged Meeting Minutes Awaiting Maker-Checker Review
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {pendingCreatedMeetings.map((chg) => (
              <div
                key={chg.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-amber-200/90 bg-white px-3.5 py-2.5 dark:border-amber-900/60 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                      {chg.itemLabel}
                    </span>
                    <PendingApprovalBadge compact />
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">{chg.summary}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    By {chg.editorName} ({chg.editorDepartment}) · {formatDateTime(chg.submittedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Minutes Cards */}
      {filteredMeetings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            No meeting minutes match your filters
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjust search filters or log a new Meeting Minutes &amp; Action Items record.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredMeetings.map((mom) => {
            const openCount = mom.actionItems.filter((a) => isActionItemOpen(a.status)).length;
            return (
              <article
                key={mom.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 tabular-nums dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {mom.code}
                      </span>
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {mom.department}
                      </span>
                      <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {formatShortDate(mom.meetingDate)}
                      </span>
                      {openCount > 0 && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800 tabular-nums dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
                          {openCount} open action{openCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {pendingMeetingEditIds.has(mom.id) && <PendingApprovalBadge compact />}
                      {mom.approvalStamp && (
                        <span
                          title={`${mom.approvalStamp.badgeLabel} (${formatDateTime(mom.approvalStamp.stampedAt)})`}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300"
                        >
                          <BadgeCheck className="h-3.5 w-3.5" />
                          <span>VERIFIED &amp; APPROVED</span>
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                      {mom.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Facilitator: <strong className="text-slate-700 dark:text-slate-200">{mom.facilitator}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                        <span>Attendees: {mom.attendees.join(', ')}</span>
                      </span>
                    </div>
                  </div>
                  {(isSuperAdmin || isAdmin) && (onStampMeeting || onDeleteMeeting) && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {isSuperAdmin && onStampMeeting && !mom.approvalStamp && (
                        <button
                          type="button"
                          onClick={() => onStampMeeting(mom.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300"
                        >
                          <BadgeCheck className="h-3.5 w-3.5" />
                          <span>Stamp &amp; Approve</span>
                        </button>
                      )}
                      {isAdmin && onDeleteMeeting && (
                        confirmDeleteMomId === mom.id ? (
                          <div className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 dark:border-rose-800 dark:bg-rose-950/60">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteMeeting(mom.id);
                                setConfirmDeleteMomId(null);
                              }}
                              className="px-1.5 text-[11px] font-bold text-rose-700 hover:underline dark:text-rose-300"
                            >
                              Move to Bin
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMomId(null)}
                              className="px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMomId(mom.id)}
                            title="Move MoM to 30-day Recycle Bin"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Recycle Bin</span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Body: Summary + Decisions + Action Items */}
                <div className="space-y-5 p-6">
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    <div className="lg:col-span-6">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100">
                          Executive Summary
                        </h4>
                        {canManage && mom.summary.trim() && (
                          <button
                            type="button"
                            onClick={() => handleStartConvertNoteToAction(mom, mom.summary)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Note → Action</span>
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">{mom.summary}</p>
                    </div>

                    <div className="lg:col-span-6">
                      <h4 className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100">
                        Key Decisions Recorded ({mom.decisions.length})
                      </h4>
                      {mom.decisions.length === 0 ? (
                        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                          No formal resolutions recorded.
                        </p>
                      ) : (
                        <ul className="mt-1.5 space-y-1.5">
                          {mom.decisions.map((decision, idx) => (
                            <li
                              key={`${mom.id}-dec-${idx}`}
                              className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300"
                            >
                              <div className="flex min-w-0 items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <span className="min-w-0 break-words">{decision}</span>
                              </div>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleStartConvertNoteToAction(mom, decision)}
                                  title="Convert this discussion point into a tracked action item"
                                  className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                                >
                                  + Action
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Action Items Register */}
                  <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100">
                        Action Items &amp; Task Tracker ({mom.actionItems.length})
                      </h4>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingForMeetingId((prev) =>
                              prev === mom.id ? null : mom.id,
                            );
                            setInlineTitle('');
                            setInlineDesc('');
                            setInlineDept(mom.department);
                            setInlineOwner(currentUser.name);
                            setInlineStatus('Todo');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Action Item</span>
                        </button>
                      )}
                    </div>

                    {/* Inline Add Action Form */}
                    {canManage && addingForMeetingId === mom.id && (
                      <form
                        onSubmit={(e) => handleInlineAddSubmit(e, mom.id)}
                        className="mt-3 grid grid-cols-1 gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 sm:grid-cols-12 dark:border-indigo-900/60 dark:bg-indigo-950/30"
                      >
                        <input
                          type="text"
                          required
                          value={inlineTitle}
                          onChange={(e) => setInlineTitle(e.target.value)}
                          placeholder="Task title (e.g. Finalize Q4 Security Audit)..."
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                        <input
                          type="text"
                          value={inlineDesc}
                          onChange={(e) => setInlineDesc(e.target.value)}
                          placeholder="Deliverable details / context..."
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-7 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                        <input
                          type="text"
                          value={inlineOwner}
                          onChange={(e) => setInlineOwner(e.target.value)}
                          list="mom-team-owners"
                          placeholder="Assignee"
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <select
                          aria-label="Action item status"
                          value={inlineStatus}
                          onChange={(e) =>
                            setInlineStatus(e.target.value as 'Todo' | 'In Progress' | 'Done')
                          }
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          <option value="Todo">Todo</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Done">Done</option>
                        </select>
                        <select
                          aria-label="Action item priority"
                          value={inlinePriority}
                          onChange={(e) => setInlinePriority(e.target.value as Priority)}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          aria-label="Due date"
                          value={inlineDue}
                          onChange={(e) => setInlineDue(e.target.value)}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <button
                          type="submit"
                          className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 sm:col-span-2 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                        >
                          Add Task
                        </button>
                      </form>
                    )}

                    <div className="mt-3 space-y-2">
                      {mom.actionItems.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">No action items logged yet.</p>
                      ) : (
                        mom.actionItems.map((item) => {
                          const overdue = isActionItemOverdue(item, todayStr);
                          const open = isActionItemOpen(item.status);
                          return (
                            <div
                              key={item.id}
                              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                                overdue
                                  ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20'
                                  : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/50'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {renderActionStatusBadge(mom.id, item)}
                                  <PriorityBadge priority={item.priority} />
                                  {overdue && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                                      <AlertTriangle className="h-3 w-3 shrink-0" />
                                      <span>Overdue</span>
                                    </span>
                                  )}
                                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                    Assignee:{' '}
                                    <strong className="text-slate-900 dark:text-slate-100">
                                      {item.ownerName}
                                    </strong>{' '}
                                    · {item.department}
                                  </span>
                                  <span
                                    className={`font-mono text-[11px] tabular-nums ${
                                      overdue
                                        ? 'font-bold text-rose-700 dark:text-rose-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    Due {formatShortDate(item.dueDate)}
                                  </span>
                                </div>
                                {item.title && (
                                  <p className="mt-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {item.title}
                                  </p>
                                )}
                                {(!item.title || item.description !== item.title) && (
                                  <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {item.description}
                                  </p>
                                )}
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                {item.linkedRequestId && (
                                  <button
                                    type="button"
                                    onClick={() => onInspectRequest(item.linkedRequestId!)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-mono text-xs font-semibold whitespace-nowrap text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                                  >
                                    <span>{item.linkedRequestId}</span>
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {canManage && open && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => onConvertActionToRequest(mom.id, item.id)}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-indigo-700"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      <span>Convert to Tracked Request</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onCompleteActionItem(mom.id, item.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                      <span>Mark Done</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <datalist id="mom-team-owners">
        {availableMembers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Log Meeting Minutes Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-mom-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2
                  id="create-mom-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Log Meeting Minutes (MoM) &amp; Action Items
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Capture executive decisions and action items convertible into tracked requests
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
                >
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="mom-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Meeting Title <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <input
                  id="mom-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="e.g., Q4 Cloud FinOps & Change Advisory Board Sync"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="mom-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Meeting Date
                  </label>
                  <input
                    id="mom-date"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="mom-dept" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Department
                  </label>
                  <select
                    id="mom-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {availableDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="mom-fac" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Facilitator
                  </label>
                  <input
                    id="mom-fac"
                    type="text"
                    list="mom-team-owners"
                    value={facilitator}
                    onChange={(e) => setFacilitator(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="mom-att" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Attendees (comma-separated)
                </label>
                <input
                  id="mom-att"
                  type="text"
                  value={attendeesInput}
                  onChange={(e) => setAttendeesInput(e.target.value)}
                  placeholder="Comma-separated attendee names"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label htmlFor="mom-sum" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Meeting Summary <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <textarea
                  id="mom-sum"
                  rows={3}
                  value={summary}
                  onChange={(e) => {
                    setSummary(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Summarize key topics, operational bottlenecks, and budget governance reviews..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Key Decisions Builder */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Key Decisions</p>
                <div className="mt-2 space-y-1.5">
                  {decisions.map((dec, idx) => (
                    <div
                      key={`${dec}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <span className="text-slate-800 dark:text-slate-200">{dec}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <input
                    type="text"
                    value={newDecision}
                    onChange={(e) => setNewDecision(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDraftDecision();
                      }
                    }}
                    placeholder="Add recorded decision..."
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddDraftDecision}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Add Decision
                  </button>
                </div>
              </div>

              {/* Action Items Builder */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Action Items ({draftActions.length})
                </p>
                <div className="mt-2 space-y-1.5">
                  {draftActions.map((act, idx) => (
                    <div
                      key={`${act.description}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {act.title ? `${act.title} — ` : ''}
                          {act.description}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {act.status ?? 'Todo'} · {act.ownerName} · {act.department} · {act.priority} · Due {act.dueDate}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftActions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    type="text"
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder="Task title..."
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none sm:col-span-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    value={actDesc}
                    onChange={(e) => setActDesc(e.target.value)}
                    placeholder="Action item details..."
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none sm:col-span-7 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    list="mom-team-owners"
                    value={actOwner}
                    onChange={(e) => setActOwner(e.target.value)}
                    placeholder="Assignee"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none sm:col-span-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <select
                    aria-label="Draft action item status"
                    value={actStatus}
                    onChange={(e) =>
                      setActStatus(e.target.value as 'Todo' | 'In Progress' | 'Done')
                    }
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                  <select
                    value={actPriority}
                    onChange={(e) => setActPriority(e.target.value as Priority)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={actDept}
                    onChange={(e) => setActDept(e.target.value as Department)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {availableDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={actDue}
                    onChange={(e) => setActDue(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddDraftAction}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 sm:col-span-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Save Meeting Minutes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
