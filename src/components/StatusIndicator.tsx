import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock,
  FileEdit,
  Flame,
  FolderKanban,
  GitBranch,
  Package,
  Send,
  Shield,
  ShieldCheck,
  User,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Priority, RequestStatus, Role } from '../types/nexops';
import { getBudgetHealthTone, getSlaCountdown } from '../utils/storage';

export function StatusBadge({ status }: { status: RequestStatus }) {
  const config: Record<
    RequestStatus,
    { classes: string; icon: typeof CheckCircle2; label: string }
  > = {
    Approved: {
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
      label: 'Approved',
    },
    'Under QA Review': {
      classes: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Clock,
      label: 'Under QA Review',
    },
    'Revision Required': {
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: AlertCircle,
      label: 'Revision Required',
    },
    Submitted: {
      classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: Send,
      label: 'Submitted',
    },
    Draft: {
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: FileEdit,
      label: 'Draft',
    },
    Rejected: {
      classes: 'bg-rose-100 text-rose-800 border-rose-300',
      icon: XCircle,
      label: 'Rejected',
    },
  };

  const { classes, icon: Icon, label } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const config: Record<
    Priority,
    { classes: string; icon: typeof ArrowUp; label: string }
  > = {
    Urgent: {
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: Flame,
      label: 'Urgent',
    },
    High: {
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: AlertTriangle,
      label: 'High',
    },
    Medium: {
      classes: 'bg-slate-50 text-slate-700 border-slate-200',
      icon: ArrowRight,
      label: 'Medium',
    },
    Low: {
      classes: 'bg-slate-50 text-slate-500 border-slate-200',
      icon: ArrowDown,
      label: 'Low',
    },
  };

  const { classes, icon: Icon, label } = config[priority];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const config: Record<Role, { classes: string; icon: typeof Shield }> = {
    Admin: {
      classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: Shield,
    },
    'Manager / QA Reviewer': {
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: ShieldCheck,
    },
    'Staff / Contributor': {
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: User,
    },
  };

  const { classes, icon: Icon } = config[role];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{role}</span>
    </span>
  );
}

export function OverdueBadge({ days }: { days?: number }) {
  return (
    <span
      title={days && days > 0 ? `${days} day${days > 1 ? 's' : ''} past SLA due date` : 'Past SLA due date'}
      className="inline-flex items-center gap-1 rounded-md border border-rose-700 bg-rose-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white whitespace-nowrap shrink-0"
    >
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>OVERDUE</span>
    </span>
  );
}

export function SlaCountdownPill({
  dueDate,
  status,
  nowMs,
}: {
  dueDate: string;
  status: RequestStatus;
  nowMs?: number;
}) {
  const sla = getSlaCountdown(dueDate, status, nowMs);

  const toneClasses: Record<typeof sla.tone, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    neutral: 'border-slate-200 bg-slate-50 text-slate-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap shrink-0 ${toneClasses[sla.tone]}`}
    >
      {sla.breached ? (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span>{sla.label}</span>
    </span>
  );
}

export function ProjectLinkBadge({
  code,
  name,
}: {
  code: string;
  name?: string;
}) {
  return (
    <span
      title={name ? `${code} — ${name}` : code}
      className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/80 px-2 py-0.5 text-[11px] font-semibold text-indigo-800"
    >
      <FolderKanban className="h-3 w-3 shrink-0 text-indigo-600" aria-hidden="true" />
      <span className="font-mono tabular-nums shrink-0">{code}</span>
      {name && <span className="truncate font-medium text-indigo-700">· {name}</span>}
    </span>
  );
}

export function AssetLinkBadge({
  tag,
  name,
}: {
  tag: string;
  name?: string;
}) {
  return (
    <span
      title={name ? `${tag} — ${name}` : tag}
      className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800"
    >
      <Package className="h-3 w-3 shrink-0 text-slate-600" aria-hidden="true" />
      <span className="font-mono tabular-nums shrink-0">{tag}</span>
      {name && <span className="truncate font-medium text-slate-600">· {name}</span>}
    </span>
  );
}

export function TwoTierBadge({ stage1Completed }: { stage1Completed?: boolean }) {
  return (
    <span
      title={
        stage1Completed
          ? 'Two-Tier Approval: Stage 1 complete, Stage 2 Executive Sign-Off'
          : 'Requires Two-Tier Approval (Manager/QA Stage 1 → Admin Stage 2)'
      }
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
        stage1Completed
          ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{stage1Completed ? 'Stage 2 Admin Pending' : '2-Tier Approval'}</span>
    </span>
  );
}

export function DelegatedBadge({ fromName }: { fromName: string }) {
  return (
    <span
      title={`Auto-delegated from ${fromName} (Out-of-Office)`}
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 whitespace-nowrap shrink-0"
    >
      <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>OOO Delegated ({fromName})</span>
    </span>
  );
}

export function BudgetHealthBar({
  utilizationPct,
  showLabel = true,
}: {
  utilizationPct: number;
  showLabel?: boolean;
}) {
  const tone = getBudgetHealthTone(utilizationPct);
  const barClasses =
    tone === 'rose'
      ? 'bg-rose-600'
      : tone === 'amber'
        ? 'bg-amber-500'
        : 'bg-emerald-600';
  const textClasses =
    tone === 'rose'
      ? 'text-rose-700'
      : tone === 'amber'
        ? 'text-amber-800'
        : 'text-emerald-700';

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClasses}`}
          style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }}
        />
      </div>
      {showLabel && (
        <span className={`font-mono text-xs font-bold tabular-nums whitespace-nowrap ${textClasses}`}>
          {utilizationPct}%
        </span>
      )}
    </div>
  );
}


