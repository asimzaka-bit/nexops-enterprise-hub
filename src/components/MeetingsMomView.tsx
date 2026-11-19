import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
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
  MeetingMinute,
  Priority,
  Role,
  TeamMember,
} from '../types/nexops';
import { formatShortDate, getTodayDateString } from '../utils/storage';
import { PriorityBadge } from './StatusIndicator';

export interface CreateMeetingPayload {
  title: string;
  meetingDate: string;
  department: Department;
  facilitator: string;
  attendees: string[];
  summary: string;
  decisions: string[];
  actionItems: {
    description: string;
    ownerName: string;
    department: Department;
    priority: Priority;
    dueDate: string;
  }[];
}

interface MeetingsMomViewProps {
  meetings: MeetingMinute[];
  activeRole: Role;
  currentUser: TeamMember;
  departments: string[];
  teamMembers: TeamMember[];
  onCreateMeeting: (payload: CreateMeetingPayload) => void;
  onAddActionItem: (
    meetingId: string,
    item: {
      description: string;
      ownerName: string;
      department: Department;
      priority: Priority;
      dueDate: string;
    },
  ) => void;
  onConvertActionToRequest: (meetingId: string, actionItemId: string) => void;
  onCompleteActionItem: (meetingId: string, actionItemId: string) => void;
  onInspectRequest: (requestId: string) => void;
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
  departments,
  teamMembers,
  onCreateMeeting,
  onAddActionItem,
  onConvertActionToRequest,
  onCompleteActionItem,
  onInspectRequest,
}: MeetingsMomViewProps) {
  const canManage = activeRole === 'Admin' || activeRole === 'Manager / QA Reviewer';

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
  const [actDesc, setActDesc] = useState('');
  const [actOwner, setActOwner] = useState(currentUser.name);
  const [actDept, setActDept] = useState<Department>(departments[0] ?? 'Operations');
  const [actPriority, setActPriority] = useState<Priority>('High');
  const [actDue, setActDue] = useState(getDefaultDueDate(5));
  const [formError, setFormError] = useState<string | null>(null);

  // Inline add-action state per meeting card
  const [addingForMeetingId, setAddingForMeetingId] = useState<string | null>(null);
  const [inlineDesc, setInlineDesc] = useState('');
  const [inlineOwner, setInlineOwner] = useState(currentUser.name);
  const [inlineDept, setInlineDept] = useState<Department>(departments[0] ?? 'Operations');
  const [inlinePriority, setInlinePriority] = useState<Priority>('Medium');
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
    const openActions = allActions.filter((a) => a.status === 'Open').length;
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
        !openActionsOnly || m.actionItems.some((a) => a.status === 'Open');
      const matchesQuery =
        !q ||
        m.code.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.facilitator.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.actionItems.some(
          (a) =>
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
    setActDesc('');
    setActOwner(availableMembers[0] || currentUser.name);
    setActDept(availableDepartments[0] ?? 'Operations');
    setActPriority('High');
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
    const trimmed = actDesc.trim();
    if (!trimmed) return;
    setDraftActions((prev) => [
      ...prev,
      {
        description: trimmed,
        ownerName: actOwner.trim() || currentUser.name,
        department: actDept,
        priority: actPriority,
        dueDate: actDue || getDefaultDueDate(5),
      },
    ]);
    setActDesc('');
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
    if (!inlineDesc.trim()) return;
    onAddActionItem(meetingId, {
      description: inlineDesc.trim(),
      ownerName: inlineOwner.trim() || currentUser.name,
      department: inlineDept,
      priority: inlinePriority,
      dueDate: inlineDue || getDefaultDueDate(5),
    });
    setInlineDesc('');
    setAddingForMeetingId(null);
  };

  const renderActionStatusBadge = (item: MeetingActionItem) => {
    if (item.status === 'Converted to Request') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 whitespace-nowrap">
          <Send className="h-3 w-3 shrink-0" />
          <span>Tracked Request</span>
        </span>
      );
    }
    if (item.status === 'Completed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Completed</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 whitespace-nowrap">
        <ListChecks className="h-3 w-3 shrink-0" />
        <span>Open Action</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Logged Governance Meetings</span>
            <CalendarDays className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.totalMeetings}
          </p>
          <p className="mt-1 text-xs text-slate-500">Official executive &amp; ops MoM archive</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Key Decisions Recorded</span>
            <ClipboardList className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.totalDecisions}
          </p>
          <p className="mt-1 text-xs text-slate-500">Resolutions documented across sessions</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Open Action Items</span>
            <ListChecks className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-amber-700 tabular-nums">
            {metrics.openActions}
          </p>
          <p className="mt-1 text-xs text-slate-500">Ready for 1-click request conversion</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Converted to Requests</span>
            <Send className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-indigo-700 tabular-nums">
            {metrics.convertedActions}
          </p>
          <p className="mt-1 text-xs text-slate-500">Active in QA &amp; approval workflow queue</p>
        </div>
      </section>

      {!canManage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Viewing Meeting Minutes in read-only mode as <strong>{activeRole}</strong>. Logging new
            MoM records or converting action items to operational requests requires{' '}
            <strong>Manager / QA Reviewer</strong> or <strong>Admin</strong> permissions.
          </span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search MoM Code (MOM-2026-014), title, facilitator, action owner..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter meetings by department"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
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
                : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
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

      {/* Meeting Minutes Cards */}
      {filteredMeetings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="font-display text-sm font-semibold text-slate-900">
            No meeting minutes match your filters
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Adjust search filters or log a new Meeting Minutes &amp; Action Items record.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredMeetings.map((mom) => {
            const openCount = mom.actionItems.filter((a) => a.status === 'Open').length;
            return (
              <article
                key={mom.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 tabular-nums">
                        {mom.code}
                      </span>
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {mom.department}
                      </span>
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        {formatShortDate(mom.meetingDate)}
                      </span>
                      {openCount > 0 && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800 tabular-nums">
                          {openCount} open action{openCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-base font-bold text-slate-900">
                      {mom.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        Facilitator: <strong className="text-slate-700">{mom.facilitator}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>Attendees: {mom.attendees.join(', ')}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Body: Summary + Decisions + Action Items */}
                <div className="space-y-5 p-6">
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    <div className="lg:col-span-6">
                      <h4 className="text-xs font-bold tracking-wide text-slate-900">
                        Executive Summary
                      </h4>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{mom.summary}</p>
                    </div>

                    <div className="lg:col-span-6">
                      <h4 className="text-xs font-bold tracking-wide text-slate-900">
                        Key Decisions Recorded ({mom.decisions.length})
                      </h4>
                      {mom.decisions.length === 0 ? (
                        <p className="mt-1.5 text-xs text-slate-400">
                          No formal resolutions recorded.
                        </p>
                      ) : (
                        <ul className="mt-1.5 space-y-1.5">
                          {mom.decisions.map((decision, idx) => (
                            <li
                              key={`${mom.id}-dec-${idx}`}
                              className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-700"
                            >
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>{decision}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Action Items Register */}
                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold tracking-wide text-slate-900">
                        Action Items &amp; Request Conversion ({mom.actionItems.length})
                      </h4>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingForMeetingId((prev) =>
                              prev === mom.id ? null : mom.id,
                            );
                            setInlineDept(mom.department);
                            setInlineOwner(currentUser.name);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
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
                        className="mt-3 grid grid-cols-1 gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 sm:grid-cols-12"
                      >
                        <input
                          type="text"
                          required
                          value={inlineDesc}
                          onChange={(e) => setInlineDesc(e.target.value)}
                          placeholder="Action item deliverable description..."
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-5"
                        />
                        <input
                          type="text"
                          value={inlineOwner}
                          onChange={(e) => setInlineOwner(e.target.value)}
                          list="mom-team-owners"
                          placeholder="Owner"
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2"
                        />
                        <select
                          value={inlinePriority}
                          onChange={(e) => setInlinePriority(e.target.value as Priority)}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={inlineDue}
                          onChange={(e) => setInlineDue(e.target.value)}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-2"
                        />
                        <button
                          type="submit"
                          className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 sm:col-span-1"
                        >
                          Add
                        </button>
                      </form>
                    )}

                    <div className="mt-3 space-y-2">
                      {mom.actionItems.length === 0 ? (
                        <p className="text-xs text-slate-400">No action items logged yet.</p>
                      ) : (
                        mom.actionItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {renderActionStatusBadge(item)}
                                <PriorityBadge priority={item.priority} />
                                <span className="text-xs font-medium text-slate-600">
                                  Owner: <strong className="text-slate-900">{item.ownerName}</strong>{' '}
                                  · {item.department}
                                </span>
                                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                                  Due {formatShortDate(item.dueDate)}
                                </span>
                              </div>
                              <p className="mt-1.5 text-xs font-medium text-slate-900">
                                {item.description}
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {item.linkedRequestId && (
                                <button
                                  type="button"
                                  onClick={() => onInspectRequest(item.linkedRequestId!)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
                                >
                                  <span>{item.linkedRequestId}</span>
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {canManage && item.status === 'Open' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onConvertActionToRequest(mom.id, item.id)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    <span>Convert to Tracked Request</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onCompleteActionItem(mom.id, item.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>Complete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-mom-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="create-mom-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Log Meeting Minutes (MoM) &amp; Action Items
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Capture executive decisions and action items convertible into tracked requests
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="mom-title" className="block text-xs font-semibold text-slate-700">
                  Meeting Title <span className="text-rose-600">*</span>
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
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="mom-date" className="block text-xs font-semibold text-slate-700">
                    Meeting Date
                  </label>
                  <input
                    id="mom-date"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="mom-dept" className="block text-xs font-semibold text-slate-700">
                    Department
                  </label>
                  <select
                    id="mom-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {availableDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="mom-fac" className="block text-xs font-semibold text-slate-700">
                    Facilitator
                  </label>
                  <input
                    id="mom-fac"
                    type="text"
                    list="mom-team-owners"
                    value={facilitator}
                    onChange={(e) => setFacilitator(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="mom-att" className="block text-xs font-semibold text-slate-700">
                  Attendees (comma-separated)
                </label>
                <input
                  id="mom-att"
                  type="text"
                  value={attendeesInput}
                  onChange={(e) => setAttendeesInput(e.target.value)}
                  placeholder="Marcus Vance, Nadia Patel, David Kim"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="mom-sum" className="block text-xs font-semibold text-slate-700">
                  Meeting Summary <span className="text-rose-600">*</span>
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
                  className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Key Decisions Builder */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold text-slate-900">Key Decisions</p>
                <div className="mt-2 space-y-1.5">
                  {decisions.map((dec, idx) => (
                    <div
                      key={`${dec}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    >
                      <span className="text-slate-800">{dec}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-1 text-slate-400 hover:text-rose-600"
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
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddDraftDecision}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Add Decision
                  </button>
                </div>
              </div>

              {/* Action Items Builder */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold text-slate-900">
                  Action Items ({draftActions.length})
                </p>
                <div className="mt-2 space-y-1.5">
                  {draftActions.map((act, idx) => (
                    <div
                      key={`${act.description}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{act.description}</p>
                        <p className="text-[11px] text-slate-500">
                          {act.ownerName} · {act.department} · {act.priority} · Due {act.dueDate}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftActions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    type="text"
                    value={actDesc}
                    onChange={(e) => setActDesc(e.target.value)}
                    placeholder="Action item description..."
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-6"
                  />
                  <input
                    type="text"
                    list="mom-team-owners"
                    value={actOwner}
                    onChange={(e) => setActOwner(e.target.value)}
                    placeholder="Owner"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-3"
                  />
                  <select
                    value={actPriority}
                    onChange={(e) => setActPriority(e.target.value as Priority)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-3"
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
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-5"
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
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none sm:col-span-4"
                  />
                  <button
                    type="button"
                    onClick={handleAddDraftAction}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 sm:col-span-3"
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
