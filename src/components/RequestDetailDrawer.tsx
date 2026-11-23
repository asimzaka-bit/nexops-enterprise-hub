import {
  AlertCircle,
  AlertTriangle,
  AtSign,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileOutput,
  GitBranch,
  History,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  OperationalRequest,
  RequestStatus,
  Role,
  TaskComment,
  TaskSubtask,
  TeamMember,
} from '../types/nexops';
import {
  BriefRiskLevel,
  generateRuleBasedReviewBrief,
  ReviewBriefResult,
} from '../utils/reviewBrief';
import {
  formatCurrency,
  formatDateTime,
  formatShortDate,
  getBudgetUtilizationPct,
  getOverdueDays,
  isRequestOverdue,
  requiresTwoTierApproval,
} from '../utils/storage';
import {
  AssetLinkBadge,
  BudgetHealthBar,
  DelegatedBadge,
  OverdueBadge,
  PriorityBadge,
  ProjectLinkBadge,
  RoleBadge,
  SlaCountdownPill,
  StatusBadge,
  TwoTierBadge,
} from './StatusIndicator';

interface RequestDetailDrawerProps {
  request: OperationalRequest;
  activeRole: Role;
  approvalBudgetThresholdUsd?: number;
  subtasks: TaskSubtask[];
  taskComments: TaskComment[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onToggleChecklistItem: (requestId: string, itemId: string) => void;
  onTransitionStatus: (
    requestId: string,
    nextStatus: RequestStatus,
    comment?: string,
  ) => void;
  onStage1Approve?: (requestId: string, comment?: string) => void;
  onUpdateRequestFinancials?: (requestId: string, actualSpend: number) => void;
  onAddComment: (requestId: string, comment: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onAddSubtask: (requestId: string, title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onAddTaskComment: (requestId: string, body: string, mentions: string[]) => void;
  onExportReport: (requestId: string) => void;
  onDuplicateRequest: (request: OperationalRequest) => void;
  onEscalateRequest: (requestId: string) => void;
}

export function RequestDetailDrawer({
  request,
  activeRole,
  approvalBudgetThresholdUsd = 5000,
  subtasks,
  taskComments,
  teamMembers,
  onClose,
  onToggleChecklistItem,
  onTransitionStatus,
  onStage1Approve,
  onUpdateRequestFinancials,
  onAddComment,
  onDeleteRequest,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAddTaskComment,
  onExportReport,
  onDuplicateRequest,
  onEscalateRequest,
}: RequestDetailDrawerProps) {
  const [remark, setRemark] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [brief, setBrief] = useState<ReviewBriefResult | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiAvailable, setGeminiAvailable] = useState<boolean | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [actualSpendInput, setActualSpendInput] = useState(() =>
    String(request.actualSpend ?? 0),
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Sub-tasks checklist state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Threaded team comments & @mention autocomplete state
  const [commentBody, setCommentBody] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setBrief(null);
    setGeminiError(null);
    setValidationError(null);
    setActualSpendInput(String(request.actualSpend ?? 0));
    setConfirmDeleteOpen(false);
    setNewSubtaskTitle('');
    setCommentBody('');
    setSelectedMentions([]);
    setMentionQuery(null);
  }, [request.id, request.actualSpend]);

  useEffect(() => {
    let active = true;
    fetch('/api/ai/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.geminiConfigured === 'boolean') {
          setGeminiAvailable(data.geminiConfigured);
        }
      })
      .catch(() => {
        if (active) setGeminiAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const overdue = isRequestOverdue(request);
  const overdueDays = overdue ? getOverdueDays(request.dueDate) : 0;
  const canEscalate =
    request.status !== 'Approved' &&
    request.status !== 'Rejected' &&
    (overdue || request.priority === 'High' || request.priority === 'Urgent');

  const totalItems = request.checklist.length;
  const completedItems = request.checklist.filter((i) => i.checked).length;
  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;
  const uncheckedMandatory = request.checklist.filter((i) => i.mandatory && !i.checked);

  const isTwoTier = requiresTwoTierApproval(request, approvalBudgetThresholdUsd);
  const stage1Done = Boolean(request.stage1Approval);
  const stage2Done = Boolean(request.stage2Approval) || request.status === 'Approved';

  const isAdmin = activeRole === 'Admin';
  const isViewer = !isAdmin;

  const canVerifyChecklist = isAdmin;
  const isReviewer = isAdmin;

  const requestSubtasks = useMemo(
    () => subtasks.filter((st) => st.requestId === request.id),
    [subtasks, request.id],
  );
  const subtasksCompleted = requestSubtasks.filter((st) => st.completed).length;
  const subtasksTotal = requestSubtasks.length;
  const subtasksPct =
    subtasksTotal > 0 ? Math.round((subtasksCompleted / subtasksTotal) * 100) : 0;

  const requestComments = useMemo(
    () =>
      taskComments
        .filter((c) => c.requestId === request.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [taskComments, request.id],
  );

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return teamMembers
      .filter((m) => m.active && (m.approvalStatus ?? 'approved') === 'approved')
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.department.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [mentionQuery, teamMembers]);

  const handleCommentInputChange = (value: string) => {
    setCommentBody(value);
    const match = value.match(/(?:^|\s)@([a-zA-Z0-9._\s-]{0,32})$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleInsertMention = (member: TeamMember) => {
    const replaced = commentBody.replace(/(?:^|\s)@([a-zA-Z0-9._\s-]{0,32})$/, (full) => {
      const leadingSpace = full.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}@${member.name} `;
    });
    setCommentBody(replaced);
    setSelectedMentions((prev) =>
      prev.includes(member.email) ? prev : [...prev, member.email],
    );
    setMentionQuery(null);
    commentTextareaRef.current?.focus();
  };

  const handleCreateSubtaskSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isViewer || !newSubtaskTitle.trim()) return;
    onAddSubtask(request.id, newSubtaskTitle.trim());
    setNewSubtaskTitle('');
  };

  const handleSubmitThreadedComment = (e: FormEvent) => {
    e.preventDefault();
    if (isViewer || !commentBody.trim()) return;
    const textLower = commentBody.toLowerCase();
    const detectedFromText = teamMembers
      .filter(
        (m) =>
          textLower.includes(`@${m.name.toLowerCase()}`) ||
          textLower.includes(`@${m.email.toLowerCase()}`),
      )
      .map((m) => m.email);
    const allMentions = Array.from(new Set([...selectedMentions, ...detectedFromText]));
    onAddTaskComment(request.id, commentBody.trim(), allMentions);
    setCommentBody('');
    setSelectedMentions([]);
    setMentionQuery(null);
  };

  const renderCommentWithMentions = (body: string) => {
    const parts = body.split(/(@[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+)?)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@') && part.length > 1) {
        return (
          <span
            key={idx}
            className="rounded bg-indigo-50 px-1 py-0.5 font-semibold text-indigo-700"
          >
            {part}
          </span>
        );
      }
      return <Fragment key={idx}>{part}</Fragment>;
    });
  };

  const canStaffSubmit =
    isAdmin &&
    (request.status === 'Draft' || request.status === 'Revision Required');

  const canReviewActions =
    isReviewer &&
    (request.status === 'Submitted' || request.status === 'Under QA Review');

  const handleStage1SignOff = () => {
    if (uncheckedMandatory.length > 0) {
      setValidationError(
        `Stage 1 sign-off blocked: ${uncheckedMandatory.length} mandatory QA checklist item${
          uncheckedMandatory.length > 1 ? 's remain' : ' remains'
        } unverified ("${uncheckedMandatory[0].label}").`,
      );
      return;
    }
    setValidationError(null);
    if (onStage1Approve) {
      onStage1Approve(request.id, remark.trim() || undefined);
    } else {
      onTransitionStatus(request.id, 'Under QA Review', remark.trim() || undefined);
    }
    setRemark('');
  };

  const handleApprove = () => {
    if (uncheckedMandatory.length > 0) {
      setValidationError(
        `Approval blocked: ${uncheckedMandatory.length} mandatory QA checklist item${
          uncheckedMandatory.length > 1 ? 's remain' : ' remains'
        } unverified ("${uncheckedMandatory[0].label}").`,
      );
      return;
    }
    if (isTwoTier && !stage1Done) {
      setValidationError(
        'Two-Tier Approval Enforced: Complete Stage 1 (Editor / QA Review) before Executive final approval.',
      );
      return;
    }
    if (isTwoTier && !isAdmin) {
      setValidationError(
        'Executive Sign-Off Required: Only an Admin can grant Stage 2 final approval on two-tier requests.',
      );
      return;
    }
    setValidationError(null);
    onTransitionStatus(request.id, 'Approved', remark.trim() || undefined);
    setRemark('');
  };

  const handleRequestRevision = () => {
    if (!remark.trim()) {
      setValidationError(
        'Mandatory remark required: Please enter specific revision instructions before requesting a revision.',
      );
      return;
    }
    setValidationError(null);
    onTransitionStatus(request.id, 'Revision Required', remark.trim());
    setRemark('');
  };

  const handleReject = () => {
    if (!remark.trim()) {
      setValidationError(
        'Rejection reason required: Document the compliance or operational reason for rejection.',
      );
      return;
    }
    setValidationError(null);
    onTransitionStatus(request.id, 'Rejected', remark.trim());
    setRemark('');
  };

  const handleStaffSubmit = () => {
    setValidationError(null);
    onTransitionStatus(request.id, 'Submitted', remark.trim() || undefined);
    setRemark('');
  };

  const handlePostComment = () => {
    if (!remark.trim()) {
      setValidationError('Enter a comment before posting to the audit trail.');
      return;
    }
    setValidationError(null);
    onAddComment(request.id, remark.trim());
    setRemark('');
  };

  const handleGenerateRuleBrief = () => {
    setGeminiError(null);
    const result = generateRuleBasedReviewBrief(request, activeRole);
    setBrief(result);
  };

  const handleGenerateGeminiBrief = async () => {
    setGeminiLoading(true);
    setGeminiError(null);
    try {
      const response = await fetch('/api/ai/review-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, isOverdue: overdue }),
      });
      const data = await response.json();
      if (!response.ok) {
        setGeminiError(data?.error || 'Gemini API enhancement could not complete.');
        if (!brief) {
          setBrief(generateRuleBasedReviewBrief(request, activeRole));
        }
        return;
      }
      setBrief({
        source: 'gemini-4-hydrogen',
        generatedAt: data.generatedAt || new Date().toISOString(),
        riskLevel: (data.riskLevel as BriefRiskLevel) || 'Elevated Risk',
        summary: data.summary,
        completenessStatus: data.completenessStatus,
        recommendedAction: data.recommendedAction,
      });
    } catch {
      setGeminiError('Unable to reach server AI endpoint; displaying rule-based brief.');
      if (!brief) {
        setBrief(generateRuleBasedReviewBrief(request, activeRole));
      }
    } finally {
      setGeminiLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-request-title"
    >
      {/* Backdrop click closes */}
      <div className="flex-1" onClick={onClose} />

      {/* Split-View Drawer Panel */}
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
        {/* Drawer Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums">
                {request.id}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <PriorityBadge priority={request.priority} />
              <StatusBadge status={request.status} />
              <SlaCountdownPill dueDate={request.dueDate} status={request.status} nowMs={nowMs} />
              {overdue && <OverdueBadge days={overdueDays} />}
              {isTwoTier && <TwoTierBadge stage1Completed={stage1Done && !stage2Done} />}
              {request.delegatedFromReviewer && (
                <DelegatedBadge fromName={request.delegatedFromReviewer} />
              )}
              {request.projectCode && (
                <ProjectLinkBadge code={request.projectCode} name={request.projectName} />
              )}
              {request.assetTag && (
                <AssetLinkBadge tag={request.assetTag} name={request.assetName} />
              )}
              {request.momCode && (
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                  <CalendarClock className="h-3 w-3 text-indigo-600" />
                  <span>{request.momCode}</span>
                </span>
              )}
            </div>
            <h2
              id="drawer-request-title"
              className="mt-2 font-display text-lg font-bold text-slate-900 sm:text-xl"
            >
              {request.title}
            </h2>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEscalate && !isViewer && (
              <button
                type="button"
                onClick={() => onEscalateRequest(request.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Escalate to Admin</span>
              </button>
            )}
            {!isViewer && (
              <button
                type="button"
                onClick={() => onDuplicateRequest(request)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 whitespace-nowrap"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Duplicate as Template</span>
                <span className="md:hidden">Clone</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onExportReport(request.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
            >
              <FileOutput className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export Official Report</span>
              <span className="sm:hidden">Report</span>
            </button>
            {!isViewer &&
              (confirmDeleteOpen ? (
                <div className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1">
                  <span className="text-[11px] font-semibold text-rose-800">Delete?</span>
                  <button
                    type="button"
                    onClick={() => onDeleteRequest(request.id)}
                    className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete Task</span>
                </button>
              ))}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close request details"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Split-View Body */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Left Pane: Details, Deliverable & QA Verification Checklist */}
          <div className="space-y-6 border-b border-slate-200 p-4 sm:p-6 lg:col-span-7 lg:border-r lg:border-b-0">
            {/* Revision Alert if Revision Required */}
            {request.status === 'Revision Required' && request.revisionReason && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <div>
                    <p className="text-xs font-bold text-rose-900">
                      Revision Requested by QA Reviewer
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-rose-800">
                      {request.revisionReason}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Department</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-900">
                  {request.department}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Category</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-900">{request.category}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Target Due &amp; SLA</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      overdue ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {formatShortDate(request.dueDate)}
                  </span>
                  <SlaCountdownPill
                    dueDate={request.dueDate}
                    status={request.status}
                    nowMs={nowMs}
                  />
                </div>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Submitted By</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-900">
                  {request.submittedBy}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Assigned Reviewer</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-900">
                  {request.assignedReviewer}
                </p>
                {request.delegatedFromReviewer && (
                  <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                    Delegated from {request.delegatedFromReviewer} (OOO)
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">
                  {request.assetTag
                    ? 'Linked Asset Tag'
                    : request.projectCode
                      ? 'Linked Project / Client'
                      : 'Last Updated'}
                </p>
                {request.assetTag || request.projectCode ? (
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {request.projectCode && (
                      <ProjectLinkBadge code={request.projectCode} name={request.projectName} />
                    )}
                    {request.assetTag && (
                      <AssetLinkBadge tag={request.assetTag} name={request.assetName} />
                    )}
                  </div>
                ) : (
                  <p className="mt-0.5 font-mono text-[11px] text-slate-700 tabular-nums">
                    {formatDateTime(request.updatedAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Financial Cost-Center & Budget Variance Box */}
            {(typeof request.estimatedCost === 'number' || typeof request.actualSpend === 'number') && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-indigo-600" />
                    <h3 className="font-display text-xs font-bold text-slate-900">
                      Cost-Center Budget &amp; Spend Tracker ({request.currency || 'USD'})
                    </h3>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                    {formatCurrency(request.actualSpend ?? 0, request.currency || 'USD')} /{' '}
                    {formatCurrency(request.estimatedCost ?? 0, request.currency || 'USD')}
                  </span>
                </div>

                <div className="mt-2.5">
                  <BudgetHealthBar
                    utilizationPct={getBudgetUtilizationPct(
                      request.estimatedCost ?? 0,
                      request.actualSpend ?? 0,
                    )}
                  />
                </div>

                {isReviewer && onUpdateRequestFinancials && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <label
                      htmlFor="drawer-actual-spend"
                      className="text-[11px] font-semibold text-slate-600"
                    >
                      Record Actual Spend ({request.currency || 'USD'}):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="drawer-actual-spend"
                        type="number"
                        min={0}
                        step="1"
                        value={actualSpendInput}
                        onChange={(e) => setActualSpendInput(e.target.value)}
                        className="h-8 w-32 rounded-lg border border-slate-200 px-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = Number(actualSpendInput);
                          if (!Number.isNaN(parsed) && parsed >= 0) {
                            onUpdateRequestFinancials(request.id, Math.round(parsed));
                          }
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        Update Spend
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Operational Scope & Deliverable Link */}
            <div>
              <h3 className="text-xs font-bold tracking-wide text-slate-900">
                Operational Scope &amp; Deliverable
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {request.description}
              </p>

              {request.deliverableUrl && (
                <div className="mt-3">
                  <a
                    href={request.deliverableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{request.deliverableUrl}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Interactive QA Verification Checklist */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    QA Verification Checklist
                  </h3>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                  {completedItems}/{totalItems} Verified ({completionPct}%)
                </span>
              </div>

              {/* Completion Progress Bar */}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${
                    completionPct === 100 ? 'bg-emerald-600' : 'bg-indigo-600'
                  }`}
                  style={{ width: `${completionPct}%` }}
                />
              </div>

              {!canVerifyChecklist && (
                <p className="mt-2.5 text-[11px] text-slate-500">
                  Read-only access. Only verified Admins can verify checklist gates or update
                  records.
                </p>
              )}

              <div className="mt-4 space-y-2.5">
                {request.checklist.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      item.checked
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-white'
                    } ${canVerifyChecklist ? 'cursor-pointer hover:border-slate-300' : 'cursor-default'}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={!canVerifyChecklist}
                      onChange={() => {
                        setValidationError(null);
                        onToggleChecklistItem(request.id, item.id);
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`text-xs font-medium ${
                            item.checked ? 'text-slate-900' : 'text-slate-800'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            item.mandatory ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {item.mandatory ? 'Mandatory' : 'Optional'}
                        </span>
                      </div>
                      {item.checked && item.verifiedBy && (
                        <p className="mt-1 font-mono text-[11px] text-emerald-700 tabular-nums">
                          Verified by {item.verifiedBy} ·{' '}
                          {item.verifiedAt ? formatDateTime(item.verifiedAt) : ''}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Sub-Tasks Checklist */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Sub-Tasks Checklist
                  </h3>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                  {subtasksCompleted}/{subtasksTotal} Done ({subtasksPct}%)
                </span>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${
                    subtasksPct === 100 && subtasksTotal > 0 ? 'bg-emerald-600' : 'bg-indigo-600'
                  }`}
                  style={{ width: `${subtasksPct}%` }}
                />
              </div>

              {!isViewer && (
                <form onSubmit={handleCreateSubtaskSubmit} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add actionable sub-task step..."
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Sub-Task</span>
                  </button>
                </form>
              )}

              {requestSubtasks.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-center text-xs text-slate-500">
                  No sub-tasks added yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {requestSubtasks.map((st) => (
                    <div
                      key={st.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                        st.completed
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <label
                        className={`flex min-w-0 flex-1 items-center gap-2.5 ${
                          isViewer ? 'cursor-default' : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={st.completed}
                          disabled={isViewer}
                          onChange={() => onToggleSubtask(st.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-medium ${
                              st.completed ? 'text-slate-500 line-through' : 'text-slate-800'
                            }`}
                          >
                            {st.title}
                          </p>
                          {st.completed && st.completedBy && (
                            <p className="font-mono text-[10px] text-emerald-700">
                              Completed by {st.completedBy}
                              {st.completedAt ? ` · ${formatDateTime(st.completedAt)}` : ''}
                            </p>
                          )}
                        </div>
                      </label>
                      {!isViewer && (
                        <button
                          type="button"
                          onClick={() => onDeleteSubtask(st.id)}
                          aria-label={`Delete sub-task ${st.title}`}
                          className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: AI Review Brief, Role-Aware Workflow Actions & Immutable Audit Trail */}
          <div className="flex flex-col gap-5 bg-slate-50/50 p-6 lg:col-span-5">
            {/* AI Executive Summary & Risk Check Panel */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-indigo-600 shrink-0" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    AI Executive Summary &amp; Risk Check
                  </h3>
                </div>
                {brief && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                      brief.riskLevel === 'Critical SLA Risk'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : brief.riskLevel === 'Elevated Risk'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    <ShieldAlert className="h-3 w-3" />
                    <span>{brief.riskLevel}</span>
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-xs text-slate-500">
                Synthesizes scope, priority, checklist completion, SLA timing, and audit history.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateRuleBrief}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>{brief ? 'Refresh AI Review Brief' : 'Generate AI Review Brief'}</span>
                </button>

                {geminiAvailable && (
                  <button
                    type="button"
                    disabled={geminiLoading}
                    onClick={handleGenerateGeminiBrief}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-60 whitespace-nowrap"
                  >
                    {geminiLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    <span>{geminiLoading ? 'Analyzing...' : 'Enhance with Gemini'}</span>
                  </button>
                )}
              </div>

              {geminiError && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900"
                >
                  {geminiError}
                </div>
              )}

              {brief && (
                <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3.5">
                  <ul className="space-y-2.5 text-xs leading-relaxed text-slate-700">
                    <li className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                      <span className="block font-semibold text-slate-900">1. Summary</span>
                      <span className="mt-0.5 block">{brief.summary}</span>
                    </li>
                    <li className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                      <span className="block font-semibold text-slate-900">
                        2. Completeness Status
                      </span>
                      <span className="mt-0.5 block">{brief.completenessStatus}</span>
                    </li>
                    <li className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5">
                      <span className="block font-semibold text-indigo-950">
                        3. Recommended Action
                      </span>
                      <span className="mt-0.5 block text-indigo-900">
                        {brief.recommendedAction}
                      </span>
                    </li>
                  </ul>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Engine:{' '}
                      {brief.source === 'gemini-4-hydrogen'
                        ? 'Gemini 4 Hydrogen'
                        : 'Deterministic Rule Engine'}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatDateTime(brief.generatedAt)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Workflow Action Panel */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Workflow Action Panel
                </h3>
                <RoleBadge role={activeRole} />
              </div>

              {/* Two-Tier Escalated Approval Chain Stepper */}
              {isTwoTier && (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                      <GitBranch className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Two-Tier Escalated Approval Chain</span>
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-indigo-700">
                      {stage2Done
                        ? '2/2 Complete'
                        : stage1Done
                          ? 'Stage 2 Pending'
                          : 'Stage 1 Pending'}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div
                      className={`rounded-lg border p-2.5 text-[11px] ${
                        stage1Done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-amber-200 bg-white text-slate-800'
                      }`}
                    >
                      <p className="font-bold">1. Editor / QA Review</p>
                      {request.stage1Approval ? (
                        <p className="mt-0.5 text-[10px] text-emerald-700">
                          Signed by {request.stage1Approval.actorName} ·{' '}
                          {formatDateTime(request.stage1Approval.timestamp)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          Awaiting Stage 1 QA sign-off
                        </p>
                      )}
                    </div>

                    <div
                      className={`rounded-lg border p-2.5 text-[11px] ${
                        stage2Done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : stage1Done
                            ? 'border-indigo-300 bg-white text-indigo-950'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <p className="font-bold">2. Executive / Admin Sign-Off</p>
                      {request.stage2Approval ? (
                        <p className="mt-0.5 text-[10px] text-emerald-700">
                          Signed by {request.stage2Approval.actorName} ·{' '}
                          {formatDateTime(request.stage2Approval.timestamp)}
                        </p>
                      ) : stage1Done ? (
                        <p className="mt-0.5 text-[10px] font-semibold text-indigo-700">
                          Ready for Admin final approval
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Locked until Stage 1 complete
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {validationError && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{validationError}</span>
                </div>
              )}

              {isViewer ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>
                    Read-only access. You can inspect records and export reports, while edits and
                    approvals require Admin privileges.
                  </span>
                </div>
              ) : (
                <>
                  <div className="mt-3">
                    <label
                      htmlFor="workflow-remark"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Review Remarks / Audit Note
                    </label>
                    <textarea
                      id="workflow-remark"
                      rows={3}
                      value={remark}
                      onChange={(e) => {
                        setRemark(e.target.value);
                        if (validationError) setValidationError(null);
                      }}
                      placeholder="Enter QA findings, mandatory revision instructions, or response notes..."
                      className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                {/* Staff Submit / Resubmit */}
                {canStaffSubmit && (
                  <button
                    type="button"
                    onClick={handleStaffSubmit}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>
                      {request.status === 'Revision Required'
                        ? 'Resubmit for QA Review'
                        : 'Submit for QA Review'}
                    </span>
                  </button>
                )}

                {/* Reviewer / Admin Actions */}
                {canReviewActions && (
                  <>
                    {request.status === 'Submitted' && (
                      <button
                        type="button"
                        onClick={() =>
                          onTransitionStatus(
                            request.id,
                            'Under QA Review',
                            remark.trim() || undefined,
                          )
                        }
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 whitespace-nowrap"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Claim &amp; Move to Under QA Review</span>
                      </button>
                    )}

                    {isTwoTier ? (
                      !stage1Done ? (
                        <button
                          type="button"
                          onClick={handleStage1SignOff}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Stage 1: Editor / QA Sign-Off</span>
                        </button>
                      ) : isAdmin ? (
                        <button
                          type="button"
                          onClick={handleApprove}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Stage 2: Executive Final Sign-Off &amp; Approve</span>
                        </button>
                      ) : (
                        <div className="flex w-full items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                          <span>
                            Stage 1 Complete — Awaiting Executive / Admin Final Sign-Off
                          </span>
                        </div>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={handleApprove}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Approve Request</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleRequestRevision}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 whitespace-nowrap"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Request Revision</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleReject}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {/* Allow Editor / Admin to post an audit comment */}
                <button
                  type="button"
                  onClick={handlePostComment}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <span>Add Comment</span>
                </button>
              </div>
                </>
              )}

              {request.status === 'Approved' && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>This request has completed QA and received final approval.</span>
                </div>
              )}

              {request.status === 'Rejected' && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
                  <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>This request was formally rejected during governance review.</span>
                </div>
              )}
            </div>

            {/* Threaded Team Comments with @mentions */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Team Discussion &amp; @Mentions
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {requestComments.length} comment{requestComments.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-3 space-y-2.5">
                {requestComments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-center text-xs text-slate-500">
                    No team discussion comments yet. Use @Name to mention a teammate.
                  </p>
                ) : (
                  requestComments.map((cmt) => (
                    <div
                      key={cmt.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">{cmt.authorName}</span>
                          <RoleBadge role={cmt.authorRole} />
                        </div>
                        <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                          {formatDateTime(cmt.createdAt)}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-500">{cmt.authorEmail}</p>
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                        {renderCommentWithMentions(cmt.body)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {!isViewer && (
                <form onSubmit={handleSubmitThreadedComment} className="relative mt-3">
                  <label htmlFor="threaded-comment-input" className="sr-only">
                    Add team comment
                  </label>
                  <textarea
                    ref={commentTextareaRef}
                    id="threaded-comment-input"
                    rows={2}
                    value={commentBody}
                    onChange={(e) => handleCommentInputChange(e.target.value)}
                    placeholder="Write a comment... type @ to mention a team member"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />

                  {mentionQuery !== null && mentionCandidates.length > 0 && (
                    <div className="mt-1 overflow-hidden rounded-lg border border-indigo-200 bg-white shadow-lg">
                      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-indigo-50/60 px-2.5 py-1 text-[10px] font-bold text-indigo-800">
                        <AtSign className="h-3 w-3" />
                        <span>Mention Team Member</span>
                      </div>
                      <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
                        {mentionCandidates.map((member) => (
                          <li key={member.id}>
                            <button
                              type="button"
                              onClick={() => handleInsertMention(member)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-indigo-50"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-900">{member.name}</span>
                                <span className="ml-1.5 font-mono text-[10px] text-slate-500">
                                  {member.email}
                                </span>
                              </div>
                              <span className="shrink-0 text-[10px] font-medium text-indigo-700">
                                {member.department}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      Type <span className="font-mono font-semibold text-indigo-600">@</span> to notify teammates
                    </span>
                    <button
                      type="submit"
                      disabled={!commentBody.trim()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      <span>Post Comment</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Immutable Audit Trail */}
            <div className="mt-2 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-500" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Immutable Audit Trail
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {request.auditTrail.length} events
                </span>
              </div>

              <ol className="mt-4 space-y-4">
                {[...request.auditTrail]
                  .sort(
                    (a, b) =>
                      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                  )
                  .map((event) => (
                    <li
                      key={event.id}
                      className="rounded-xl border border-slate-200 bg-white p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {event.actionType}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {formatDateTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                        {event.details}
                      </p>
                      <p className="mt-2 text-[11px] font-medium text-slate-500">
                        {event.actorName} ·{' '}
                        {event.actorSignOffTitle
                          ? `${event.actorSignOffTitle} (${event.actorRole})`
                          : event.actorRole}
                      </p>
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
