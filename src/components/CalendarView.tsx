import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  Filter,
  Link2,
  MapPin,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  CalendarEvent,
  CalendarEventType,
  Department,
  LeaveRequest,
  MeetingMinute,
  Role,
  TeamMember,
} from '../types/nexops';
import { detectCalendarConflicts, sanitizeExternalHttpUrl } from '../utils/storage';

interface CalendarViewProps {
  calendarEvents: CalendarEvent[];
  meetings: MeetingMinute[];
  leaves: LeaveRequest[];
  departments: string[];
  teamMembers?: TeamMember[];
  activeRole: Role;
  currentUser: TeamMember;
  onSaveEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}

type CalendarViewMode = 'month' | 'week';

interface UnifiedCalendarItem {
  id: string;
  source: 'custom' | 'meeting' | 'leave';
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  department: string;
  type: CalendarEventType;
  description?: string;
  locationOrLink?: string;
  attendees?: string[];
  createdBy: string;
  rawEvent?: CalendarEvent;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const EVENT_TYPE_BADGES: Record<
  CalendarEventType,
  {
    pill: string;
    chipActive: string;
    dot: string;
  }
> = {
  Meeting: {
    pill: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300',
    chipActive:
      'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-600',
    dot: 'bg-indigo-600 dark:bg-indigo-400',
  },
  Deadline: {
    pill: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/80 dark:bg-rose-950/60 dark:text-rose-300',
    chipActive: 'border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600',
    dot: 'bg-rose-600 dark:bg-rose-400',
  },
  Reminder: {
    pill: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300',
    chipActive: 'border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  Leave: {
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-300',
    chipActive:
      'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map((n) => Number(n));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function addDays(date: Date, offset: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  return next;
}

function formatReadableDate(dateKey: string): string {
  const dt = parseDateKey(dateKey);
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime12h(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24 || 'All day';
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function CalendarView({
  calendarEvents,
  meetings,
  leaves,
  departments,
  teamMembers = [],
  activeRole,
  currentUser,
  onSaveEvent,
  onDeleteEvent,
}: CalendarViewProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [typeFilter, setTypeFilter] = useState<CalendarEventType | 'All'>('All');
  const [deptFilter, setDeptFilter] = useState<string>('All');

  // Event modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(todayKey);
  const [eventTime, setEventTime] = useState('10:00');
  const [eventDepartment, setEventDepartment] = useState<Department>(
    currentUser.department || departments[0] || 'Operations',
  );
  const [eventType, setEventType] = useState<CalendarEventType>('Meeting');
  const [locationOrLink, setLocationOrLink] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [customAttendeeInput, setCustomAttendeeInput] = useState('');
  const [overrideConflict, setOverrideConflict] = useState(false);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const canManage = activeRole === 'Admin' || activeRole === 'Editor';

  const selectableMembers = useMemo(
    () =>
      teamMembers.filter(
        (m) => m.active && (m.approvalStatus ?? 'approved') === 'approved',
      ),
    [teamMembers],
  );

  const conflicts = useMemo(
    () =>
      modalOpen
        ? detectCalendarConflicts(
            {
              id: editingEvent?.id,
              date: eventDate,
              time: eventTime || '09:00',
              locationOrLink,
              attendees,
            },
            calendarEvents,
            meetings,
          )
        : [],
    [
      modalOpen,
      editingEvent?.id,
      eventDate,
      eventTime,
      locationOrLink,
      attendees,
      calendarEvents,
      meetings,
    ],
  );

  // Combine custom calendar events + synced Meetings & MoM + approved/pending Leaves
  const unifiedItems = useMemo<UnifiedCalendarItem[]>(() => {
    const customItems: UnifiedCalendarItem[] = calendarEvents.map((ev) => ({
      id: ev.id,
      source: 'custom',
      title: ev.title,
      date: ev.date,
      time: ev.time || '09:00',
      department: ev.department,
      type: ev.type,
      description: ev.description,
      locationOrLink: ev.locationOrLink,
      attendees: ev.attendees,
      createdBy: ev.createdBy,
      rawEvent: ev,
    }));

    const meetingItems: UnifiedCalendarItem[] = meetings
      .filter((m) => Boolean(m.meetingDate))
      .map((m) => ({
        id: `mom-${m.id}`,
        source: 'meeting',
        title: m.title,
        date: m.meetingDate.slice(0, 10),
        time: '10:00',
        department: m.department,
        type: 'Meeting',
        description: m.summary || `Facilitator: ${m.facilitator}`,
        attendees: m.attendees,
        createdBy: m.facilitator,
      }));

    const leaveItems: UnifiedCalendarItem[] = leaves
      .filter((l) => l.status !== 'Rejected' && Boolean(l.startDate))
      .map((l) => ({
        id: `leave-${l.id}`,
        source: 'leave',
        title: `${l.employeeName} — ${l.leaveType} (${l.status})`,
        date: l.startDate.slice(0, 10),
        time: '09:00',
        department: l.department,
        type: 'Leave',
        description: `${l.startDate} to ${l.endDate} · ${l.totalDays} day(s)${l.reason ? ` — ${l.reason}` : ''}`,
        createdBy: l.employeeName,
      }));

    return [...customItems, ...meetingItems, ...leaveItems]
      .filter((item) => {
        if (typeFilter !== 'All' && item.type !== typeFilter) return false;
        if (deptFilter !== 'All' && item.department !== deptFilter) return false;
        return true;
      })
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }, [calendarEvents, meetings, leaves, typeFilter, deptFilter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, UnifiedCalendarItem[]>();
    for (const item of unifiedItems) {
      const list = map.get(item.date);
      if (list) {
        list.push(item);
      } else {
        map.set(item.date, [item]);
      }
    }
    return map;
  }, [unifiedItems]);

  const monthGridDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    const days: { date: Date; key: string; inCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const dt = addDays(gridStart, i);
      days.push({
        date: dt,
        key: toDateKey(dt),
        inCurrentMonth: dt.getMonth() === month,
      });
    }
    return days;
  }, [cursorDate]);

  const weekGridDays = useMemo(() => {
    const dayOfWeek = cursorDate.getDay();
    const startOfWeek = addDays(cursorDate, -dayOfWeek);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = addDays(startOfWeek, i);
      return {
        date: dt,
        key: toDateKey(dt),
        inCurrentMonth: dt.getMonth() === cursorDate.getMonth(),
      };
    });
  }, [cursorDate]);

  const visibleGridDays = viewMode === 'month' ? monthGridDays : weekGridDays;

  const selectedDayEvents = useMemo(
    () => eventsByDate.get(selectedDateKey) ?? [],
    [eventsByDate, selectedDateKey],
  );

  const upcomingEvents = useMemo(() => {
    return unifiedItems.filter((item) => item.date >= todayKey).slice(0, 12);
  }, [unifiedItems, todayKey]);

  const currentRangeLabel = useMemo(() => {
    if (viewMode === 'month') {
      return cursorDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
    const start = weekGridDays[0]?.date ?? cursorDate;
    const end = weekGridDays[6]?.date ?? cursorDate;
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${startStr} – ${endStr}`;
  }, [viewMode, cursorDate, weekGridDays]);

  const summaryCounts = useMemo(() => {
    const monthPrefix = `${cursorDate.getFullYear()}-${String(cursorDate.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = unifiedItems.filter((item) => item.date.startsWith(monthPrefix));
    return {
      totalThisMonth: thisMonth.length,
      meetings: thisMonth.filter((i) => i.type === 'Meeting').length,
      deadlines: thisMonth.filter((i) => i.type === 'Deadline').length,
      reminders: thisMonth.filter((i) => i.type === 'Reminder').length,
      leaves: thisMonth.filter((i) => i.type === 'Leave').length,
    };
  }, [unifiedItems, cursorDate]);

  const handlePrev = () => {
    if (viewMode === 'month') {
      setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1));
    } else {
      setCursorDate(addDays(cursorDate, -7));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1));
    } else {
      setCursorDate(addDays(cursorDate, 7));
    }
  };

  const handleToday = () => {
    const nowDt = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    setCursorDate(nowDt);
    setSelectedDateKey(todayKey);
  };

  const openCreateModal = (presetDate?: string) => {
    if (!canManage) return;
    setEditingEvent(null);
    setTitle('');
    setEventDate(presetDate || selectedDateKey || todayKey);
    setEventTime('10:00');
    setEventDepartment(currentUser.department || departments[0] || 'Operations');
    setEventType('Meeting');
    setLocationOrLink('');
    setAttendees([]);
    setCustomAttendeeInput('');
    setOverrideConflict(false);
    setDescription('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (ev: CalendarEvent) => {
    if (!canManage) return;
    setEditingEvent(ev);
    setTitle(ev.title);
    setEventDate(ev.date);
    setEventTime(ev.time || '10:00');
    setEventDepartment(ev.department);
    setEventType(ev.type);
    setLocationOrLink(ev.locationOrLink || '');
    setAttendees(Array.isArray(ev.attendees) ? [...ev.attendees] : []);
    setCustomAttendeeInput('');
    setOverrideConflict(false);
    setDescription(ev.description || '');
    setFormError('');
    setModalOpen(true);
  };

  const toggleAttendee = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setOverrideConflict(false);
    setAttendees((prev) =>
      prev.some((a) => a.toLowerCase() === clean.toLowerCase())
        ? prev.filter((a) => a.toLowerCase() !== clean.toLowerCase())
        : [...prev, clean],
    );
  };

  const handleAddCustomAttendee = () => {
    const clean = customAttendeeInput.trim();
    if (!clean) return;
    setOverrideConflict(false);
    setAttendees((prev) =>
      prev.some((a) => a.toLowerCase() === clean.toLowerCase()) ? prev : [...prev, clean],
    );
    setCustomAttendeeInput('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Please provide an event title.');
      return;
    }
    if (!eventDate) {
      setFormError('Please select a date.');
      return;
    }
    if (conflicts.length > 0 && !overrideConflict) {
      setFormError(
        'Schedule conflict detected. Adjust time/room/attendees or confirm the conflict override checkbox below.',
      );
      return;
    }
    const cleanLocation = locationOrLink.trim() || undefined;
    const cleanAttendees = attendees.length > 0 ? attendees : undefined;
    const nowIso = new Date().toISOString();
    const nextEvent: CalendarEvent = editingEvent
      ? {
          ...editingEvent,
          title: cleanTitle,
          date: eventDate,
          time: eventTime || '09:00',
          department: eventDepartment,
          type: eventType,
          locationOrLink: cleanLocation,
          attendees: cleanAttendees,
          description: description.trim() || undefined,
          updatedAt: nowIso,
        }
      : {
          id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: cleanTitle,
          date: eventDate,
          time: eventTime || '09:00',
          department: eventDepartment,
          type: eventType,
          locationOrLink: cleanLocation,
          attendees: cleanAttendees,
          description: description.trim() || undefined,
          createdBy: currentUser.name,
          createdByEmail: currentUser.email,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

    onSaveEvent(nextEvent);
    setSelectedDateKey(eventDate);
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800/80 dark:bg-indigo-950/50 dark:text-indigo-400">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Enterprise Operations Calendar
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Centralized schedule combining department events, scheduled MoM sessions, and staff leaves
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <button
                type="button"
                onClick={() => openCreateModal(selectedDateKey)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Event</span>
              </button>
            ) : (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Read-Only Schedule (Viewer)
              </span>
            )}
          </div>
        </div>

        {/* Monthly Stats Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Month Total</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {summaryCounts.totalThisMonth}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">Meetings</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {summaryCounts.meetings}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Deadlines</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {summaryCounts.deadlines}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Reminders</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {summaryCounts.reminders}
            </p>
          </div>
          <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 sm:col-span-1 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Leaves</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {summaryCounts.leaves}
            </p>
          </div>
        </div>

        {/* Toolbar: Navigation, View Mode & Filters */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous period"
                className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next period"
                className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              {currentRangeLabel}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Filter calendar by department"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="All">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === 'month'
                    ? 'bg-slate-900 text-white dark:bg-indigo-600'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === 'week'
                    ? 'bg-slate-900 text-white dark:bg-indigo-600'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Week
              </button>
            </div>
          </div>
        </div>

        {/* Event Type Filter Row */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(['All', 'Meeting', 'Deadline', 'Reminder', 'Leave'] as const).map((t) => {
            const active = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? t === 'All'
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600'
                      : EVENT_TYPE_BADGES[t].chipActive
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {t !== 'All' && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      active ? 'bg-white' : EVENT_TYPE_BADGES[t].dot
                    }`}
                  />
                )}
                <span>{t}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Split: Interactive Calendar Grid + Selected Date & Upcoming Agenda */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Calendar Grid */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:col-span-8">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/60">
            {WEEKDAY_LABELS.map((day) => (
              <div
                key={day}
                className="py-2.5 text-center text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {visibleGridDays.map((cell) => {
              const items = eventsByDate.get(cell.key) ?? [];
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedDateKey;
              const maxVisible = viewMode === 'month' ? 2 : 5;
              const overflowCount = items.length - maxVisible;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDateKey(cell.key)}
                  className={`group flex flex-col items-stretch p-1.5 text-left transition-colors sm:p-2 ${
                    viewMode === 'month' ? 'min-h-[84px] sm:min-h-[108px]' : 'min-h-[180px] sm:min-h-[240px]'
                  } ${
                    isSelected
                      ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-500 dark:bg-indigo-950/35 dark:ring-indigo-500'
                      : cell.inCurrentMonth
                        ? 'bg-white hover:bg-slate-50/80 dark:bg-slate-900 dark:hover:bg-slate-800/40'
                        : 'bg-slate-50/50 text-slate-400 hover:bg-slate-50 dark:bg-slate-950/50 dark:text-slate-600 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs font-bold tabular-nums ${
                        isToday
                          ? 'bg-indigo-600 text-white'
                          : isSelected
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : cell.inCurrentMonth
                              ? 'text-slate-800 dark:text-slate-200'
                              : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>

                    {items.length > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-slate-400 tabular-nums dark:text-slate-500">
                        {items.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 space-y-1">
                    {items.slice(0, maxVisible).map((item) => {
                      const badge = EVENT_TYPE_BADGES[item.type];
                      return (
                        <div
                          key={item.id}
                          className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${badge.pill}`}
                          title={`${formatTime12h(item.time)} · ${item.title} (${item.department})`}
                        >
                          <span className="hidden font-mono tabular-nums sm:inline">
                            {item.time}{' '}
                          </span>
                          <span>{item.title}</span>
                        </div>
                      );
                    })}
                    {overflowCount > 0 && (
                      <p className="px-1 font-mono text-[10px] font-semibold text-indigo-600 tabular-nums dark:text-indigo-400">
                        +{overflowCount} more
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Agenda & Selected Day Panel */}
        <aside className="space-y-6 xl:col-span-4">
          {/* Selected Date Agenda */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-semibold text-indigo-600 uppercase dark:text-indigo-400">
                  Selected Date
                </p>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {formatReadableDate(selectedDateKey)}
                </h3>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => openCreateModal(selectedDateKey)}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              )}
            </div>

            {selectedDayEvents.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarIcon className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-700" />
                <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No scheduled items on this day
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {canManage
                    ? 'Click Add to schedule a meeting, deadline, or reminder.'
                    : 'Select another highlighted date to inspect details.'}
                </p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {selectedDayEvents.map((item) => {
                  const badge = EVENT_TYPE_BADGES[item.type];
                  return (
                    <li key={item.id} className="py-3 first:pt-1 last:pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.pill}`}
                            >
                              {item.type}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                              {formatTime12h(item.time)}
                            </span>
                            {item.source !== 'custom' && (
                              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                {item.source === 'meeting' ? 'Synced · MoM' : 'Synced · Leave'}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {item.department} · {item.createdBy}
                          </p>
                          {(item.locationOrLink || (item.attendees && item.attendees.length > 0)) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {item.locationOrLink && (() => {
                                const safeUrl = sanitizeExternalHttpUrl(item.locationOrLink);
                                if (safeUrl) {
                                  return (
                                    <a
                                      href={safeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex max-w-full items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                                    >
                                      <Link2 className="h-3 w-3 shrink-0" />
                                      <span className="truncate">Join Meeting Link</span>
                                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                    </a>
                                  );
                                }
                                return (
                                  <span className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                    <span className="truncate">{item.locationOrLink}</span>
                                  </span>
                                );
                              })()}
                              {item.attendees && item.attendees.length > 0 && (
                                <span
                                  className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  title={item.attendees.join(', ')}
                                >
                                  <Users className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span className="truncate">
                                    {item.attendees.length <= 2
                                      ? item.attendees.join(', ')
                                      : `${item.attendees.slice(0, 2).join(', ')} +${item.attendees.length - 2}`}
                                  </span>
                                </span>
                              )}
                            </div>
                          )}
                          {item.description && (
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {canManage && item.source === 'custom' && item.rawEvent && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(item.rawEvent!)}
                              aria-label="Edit event"
                              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteEvent(item.id)}
                              aria-label="Delete event"
                              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Upcoming Schedule */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  Upcoming Schedule
                </h3>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                {upcomingEvents.length}
              </span>
            </div>

            {upcomingEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No upcoming events scheduled from today onward.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {upcomingEvents.map((item) => {
                  const badge = EVENT_TYPE_BADGES[item.type];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDateKey(item.date);
                          setCursorDate(parseDateKey(item.date));
                        }}
                        className="flex w-full items-start justify-between gap-2.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${badge.dot}`} />
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                              {item.title}
                            </p>
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>
                              {item.date} · {formatTime12h(item.time)}
                            </span>
                            {item.locationOrLink && (
                              <span className="inline-flex max-w-[160px] items-center gap-1 font-sans text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                                {sanitizeExternalHttpUrl(item.locationOrLink) ? (
                                  <>
                                    <Link2 className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">Meeting Link</span>
                                  </>
                                ) : (
                                  <>
                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{item.locationOrLink}</span>
                                  </>
                                )}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <MapPin className="h-2.5 w-2.5" />
                          {item.department}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* Create / Edit Calendar Event Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-xs dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingEvent ? 'Edit Calendar Event' : 'Schedule New Calendar Event'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Event Title <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Q4 Operations Readiness Review"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => {
                      setEventDate(e.target.value);
                      setOverrideConflict(false);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Time
                  </label>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(e) => {
                      setEventTime(e.target.value);
                      setOverrideConflict(false);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Department
                  </label>
                  <select
                    value={eventDepartment}
                    onChange={(e) => setEventDepartment(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Event Type
                  </label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="Meeting">Meeting</option>
                    <option value="Deadline">Deadline</option>
                    <option value="Reminder">Reminder</option>
                    <option value="Leave">Leave</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Location / Room or Meeting Link
                </label>
                <input
                  type="text"
                  value={locationOrLink}
                  onChange={(e) => {
                    setLocationOrLink(e.target.value);
                    setOverrideConflict(false);
                  }}
                  placeholder="e.g., Boardroom B or https://meet.google.com/abc-defg-hij"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {locationOrLink.trim() && sanitizeExternalHttpUrl(locationOrLink) && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <Link2 className="h-3 w-3" />
                    Valid meeting URL detected — will render as a clickable join link.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Attendees ({attendees.length})
                  </label>
                  {attendees.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAttendees([]);
                        setOverrideConflict(false);
                      }}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {selectableMembers.length > 0 && (
                  <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-950/60">
                    {selectableMembers.map((member) => {
                      const selected = attendees.some(
                        (a) => a.toLowerCase() === member.name.trim().toLowerCase(),
                      );
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleAttendee(member.name)}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={customAttendeeInput}
                    onChange={(e) => setCustomAttendeeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomAttendee();
                      }
                    }}
                    placeholder="Add guest or participant name..."
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomAttendee}
                    className="h-9 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Add
                  </button>
                </div>

                {attendees.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attendees.map((person) => (
                      <span
                        key={person}
                        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300"
                      >
                        <span>{person}</span>
                        <button
                          type="button"
                          onClick={() => toggleAttendee(person)}
                          aria-label={`Remove ${person}`}
                          className="rounded hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {conflicts.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/50 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-bold">
                        Smart Schedule Conflict Detected ({conflicts.length})
                      </p>
                      <ul className="space-y-1">
                        {conflicts.map((conflict) => (
                          <li
                            key={conflict.id}
                            className="rounded-md border border-amber-200/80 bg-white/70 px-2.5 py-1.5 dark:border-amber-800/70 dark:bg-slate-900/60"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1 font-semibold">
                              <span className="truncate">{conflict.title}</span>
                              <span className="font-mono text-[11px] tabular-nums">
                                {formatTime12h(conflict.time)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                              {conflict.reasons.join(' · ')}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <label className="mt-1 flex cursor-pointer items-center gap-2 pt-1 font-semibold">
                        <input
                          type="checkbox"
                          checked={overrideConflict}
                          onChange={(e) => {
                            setOverrideConflict(e.target.checked);
                            if (e.target.checked) setFormError('');
                          }}
                          className="h-3.5 w-3.5 rounded border-amber-400 text-slate-900 focus:ring-0"
                        />
                        <span>Schedule anyway (acknowledge conflict)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Agenda / Notes
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional agenda, participants, or deliverable details..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  {editingEvent ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
