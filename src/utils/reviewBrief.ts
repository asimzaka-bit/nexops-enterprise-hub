import { OperationalRequest, Role } from '../types/nexops';
import { getOverdueDays, isRequestOverdue } from './storage';

export type BriefRiskLevel = 'Low Risk' | 'Elevated Risk' | 'Critical SLA Risk';

export interface ReviewBriefResult {
  source: 'rule-based' | 'gemini-4-hydrogen';
  generatedAt: string;
  riskLevel: BriefRiskLevel;
  summary: string;
  completenessStatus: string;
  recommendedAction: string;
}

export function generateRuleBasedReviewBrief(
  request: OperationalRequest,
  activeRole: Role,
): ReviewBriefResult {
  const overdue = isRequestOverdue(request);
  const overdueDays = overdue ? getOverdueDays(request.dueDate) : 0;

  const totalGates = request.checklist.length;
  const verifiedGates = request.checklist.filter((c) => c.checked).length;
  const mandatoryGates = request.checklist.filter((c) => c.mandatory);
  const verifiedMandatory = mandatoryGates.filter((c) => c.checked).length;
  const unverifiedMandatory = mandatoryGates.filter((c) => !c.checked);
  const hasDeliverable = Boolean(request.deliverableUrl && request.deliverableUrl.trim().length > 8);

  const auditCount = request.auditTrail.length;
  const revisionEvents = request.auditTrail.filter((e) =>
    e.details.toLowerCase().includes('revision'),
  ).length;

  // Risk assessment
  let riskLevel: BriefRiskLevel = 'Low Risk';
  if (
    overdue ||
    request.status === 'Revision Required' ||
    (request.priority === 'Urgent' && unverifiedMandatory.length > 0)
  ) {
    riskLevel = 'Critical SLA Risk';
  } else if (
    request.priority === 'High' ||
    unverifiedMandatory.length > 0 ||
    !hasDeliverable
  ) {
    riskLevel = 'Elevated Risk';
  }

  // 1. Summary bullet
  const condensedScope =
    request.description.length > 155
      ? `${request.description.slice(0, 152).trim()}...`
      : request.description;
  const summary = `${request.id} (${request.department} · ${request.category}, ${request.priority} priority) submitted by ${request.submittedBy}: ${condensedScope}`;

  // 2. Completeness Status bullet
  const gateSummary = `${verifiedGates}/${totalGates} total QA gates verified (${verifiedMandatory}/${mandatoryGates.length} mandatory)`;
  const blockerDetail =
    unverifiedMandatory.length > 0
      ? `Pending mandatory gates: ${unverifiedMandatory
          .slice(0, 2)
          .map((g) => `"${g.label}"`)
          .join(', ')}${unverifiedMandatory.length > 2 ? ` (+${unverifiedMandatory.length - 2} more)` : ''}.`
      : 'All mandatory QA gates are verified.';
  const slaNote = overdue
    ? `SLA breach: ${overdueDays} day${overdueDays > 1 ? 's' : ''} past due (${request.dueDate}).`
    : `Due ${request.dueDate} (within SLA window).`;
  const auditNote = `Audit trail contains ${auditCount} logged event${auditCount === 1 ? '' : 's'}${
    revisionEvents > 0 ? ` including ${revisionEvents} revision cycle` : ''
  }, and deliverable link is ${hasDeliverable ? 'attached' : 'missing'}.`;

  const completenessStatus = `${gateSummary}. ${blockerDetail} ${slaNote} ${auditNote}`;

  // 3. Recommended Action bullet
  let recommendedAction = '';
  if (request.status === 'Approved') {
    recommendedAction =
      'No further workflow action required; archive or export the Official Approval Dossier for compliance records.';
  } else if (request.status === 'Rejected') {
    recommendedAction =
      'Request is closed as Rejected. If remediation is planned, clone this record via "Duplicate as Template" to initiate a fresh review cycle.';
  } else if (request.status === 'Draft') {
    recommendedAction = hasDeliverable
      ? 'Finalize scope validation and click "Submit for QA Review" to enter the active governance queue.'
      : 'Attach a valid deliverable reference URL and submit the draft for QA verification.';
  } else if (request.status === 'Revision Required') {
    recommendedAction =
      activeRole === 'Staff / Contributor'
        ? `Address reviewer remarks (${request.revisionReason || 'see audit trail'}) and click "Resubmit for QA Review"${overdue ? ' immediately to clear the SLA breach' : ''}.`
        : `Follow up with ${request.submittedBy} on the requested revision${overdue ? ` (${overdueDays}d overdue)` : ''} before resuming QA verification.`;
  } else if (unverifiedMandatory.length > 0) {
    recommendedAction =
      activeRole === 'Staff / Contributor'
        ? `Coordinate with ${request.assignedReviewer} to verify the remaining ${unverifiedMandatory.length} mandatory QA gate${unverifiedMandatory.length > 1 ? 's' : ''}.`
        : `Verify the remaining ${unverifiedMandatory.length} mandatory QA checklist gate${unverifiedMandatory.length > 1 ? 's' : ''} (${unverifiedMandatory[0].label}) before approving${overdue ? ' — prioritize due to SLA overdue status' : ''}.`;
  } else {
    recommendedAction =
      activeRole === 'Staff / Contributor'
        ? `All mandatory QA checks are complete; awaiting final sign-off from ${request.assignedReviewer}.`
        : 'All mandatory QA gates and audit evidence are verified — proceed with "Approve Request" to close out SLA.';
  }

  return {
    source: 'rule-based',
    generatedAt: new Date().toISOString(),
    riskLevel,
    summary,
    completenessStatus,
    recommendedAction,
  };
}
