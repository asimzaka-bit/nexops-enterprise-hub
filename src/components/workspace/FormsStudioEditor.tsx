import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CloudDownload,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FilePlus2,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { dataService } from '../../services/dataService';
import {
  fetchGoogleFormResponses,
  fetchGoogleFormStructure,
  syncQuestionsToGoogleForm,
} from '../../services/googleWorkspaceService';
import {
  FormQuestionItem,
  FormQuestionType,
  FormStudioContent,
  FormSubmissionItem,
} from '../../types/nexops';

interface FormsStudioEditorProps {
  docId: string;
  title: string;
  documentUrl: string;
  googleFileId?: string | null;
  googleToken: string | null;
  readOnly: boolean;
  actorName: string;
  actorEmail: string;
  onNotify: (
    title: string,
    description: string,
    variant?: 'success' | 'error' | 'warning' | 'info',
  ) => void;
}

const QUESTION_TYPE_LABELS: Record<FormQuestionType, string> = {
  short_answer: 'Short answer',
  paragraph: 'Paragraph',
  multiple_choice: 'Multiple choice',
  checkboxes: 'Checkboxes',
  dropdown: 'Dropdown',
  file_upload: 'File upload',
  date_time: 'Date / Time',
};

function createInitialFormContent(title: string): FormStudioContent {
  return {
    title: title || 'Untitled Form',
    description: 'Complete the operational form fields below.',
    questions: [
      {
        id: `q-${Date.now()}-1`,
        title: 'Full Name / Department',
        type: 'short_answer',
        required: true,
      },
      {
        id: `q-${Date.now()}-2`,
        title: 'Priority / Category',
        type: 'multiple_choice',
        required: true,
        options: ['Standard', 'High Priority', 'Urgent Escalation'],
      },
    ],
    responses: [],
    updatedAt: new Date().toISOString(),
  };
}

export function FormsStudioEditor({
  docId,
  title,
  documentUrl,
  googleFileId,
  googleToken,
  readOnly,
  actorName,
  actorEmail,
  onNotify,
}: FormsStudioEditorProps) {
  const [formState, setFormState] = useState<FormStudioContent>(() =>
    createInitialFormContent(title),
  );
  const [activeTab, setActiveTab] = useState<'questions' | 'preview' | 'responses'>(
    readOnly ? 'preview' : 'questions',
  );
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string | string[]>>({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [syncingGoogle, setSyncingGoogle] = useState(false);

  useEffect(() => {
    if (readOnly && activeTab === 'questions') {
      setActiveTab('preview');
    }
  }, [readOnly, activeTab]);

  useEffect(() => {
    let active = true;
    const local = dataService.workspaceStudio.loadLocal<FormStudioContent>('forms', docId);
    const initial = local?.questions ? local : createInitialFormContent(title);
    setFormState(initial);
    setPreviewAnswers({});

    void dataService.workspaceStudio
      .fetchCloud<FormStudioContent>('forms', docId)
      .then((cloud) => {
        if (!active || !cloud?.questions) return;
        setFormState(cloud);
      });

    return () => {
      active = false;
    };
  }, [docId, title]);

  const persistForm = useCallback(
    async (next: FormStudioContent) => {
      setSaveState('saving');
      const stamped: FormStudioContent = {
        ...next,
        updatedAt: new Date().toISOString(),
        updatedBy: actorName,
      };
      await dataService.workspaceStudio.save('forms', docId, stamped, actorName);
      setSaveState('saved');
    },
    [actorName, docId],
  );

  const updateForm = (updater: (prev: FormStudioContent) => FormStudioContent) => {
    if (readOnly) return;
    setFormState((prev) => {
      const next = updater(prev);
      void persistForm(next);
      return next;
    });
  };

  const handleAddQuestion = (type: FormQuestionType = 'short_answer') => {
    if (readOnly) return;
    const needsOptions =
      type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown';
    const newQ: FormQuestionItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Question ${formState.questions.length + 1}`,
      type,
      required: false,
      options: needsOptions ? ['Option 1', 'Option 2'] : undefined,
    };
    updateForm((prev) => ({
      ...prev,
      questions: [...prev.questions, newQ],
    }));
  };

  const handleUpdateQuestion = (qId: string, patch: Partial<FormQuestionItem>) => {
    updateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== qId) return q;
        const merged = { ...q, ...patch };
        const needsOptions =
          merged.type === 'multiple_choice' ||
          merged.type === 'checkboxes' ||
          merged.type === 'dropdown';
        if (needsOptions && (!merged.options || merged.options.length === 0)) {
          merged.options = ['Option 1', 'Option 2'];
        }
        return merged;
      }),
    }));
  };

  const handleMoveQuestion = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (readOnly || target < 0 || target >= formState.questions.length) return;
    updateForm((prev) => {
      const list = [...prev.questions];
      const [item] = list.splice(index, 1);
      list.splice(target, 0, item);
      return { ...prev, questions: list };
    });
  };

  const handleDuplicateQuestion = (index: number) => {
    if (readOnly) return;
    const source = formState.questions[index];
    if (!source) return;
    const clone: FormQuestionItem = {
      ...source,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `${source.title} (Copy)`,
      options: source.options ? [...source.options] : undefined,
    };
    updateForm((prev) => {
      const list = [...prev.questions];
      list.splice(index + 1, 0, clone);
      return { ...prev, questions: list };
    });
  };

  const handleDeleteQuestion = (qId: string) => {
    if (readOnly) return;
    updateForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== qId),
    }));
  };

  const handleCopyShareLink = async () => {
    const linkToCopy =
      documentUrl && !documentUrl.startsWith('nexops://')
        ? documentUrl
        : `${window.location.origin}/?workspace=forms&form=${encodeURIComponent(docId)}`;
    try {
      await navigator.clipboard.writeText(linkToCopy);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
      onNotify('Form Link Copied', 'Shareable form URL copied to clipboard.', 'success');
    } catch {
      onNotify('Copy Failed', 'Copy the form link manually from the header.', 'warning');
    }
  };

  const handleSubmitPreviewForm = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    for (const q of formState.questions) {
      if (!q.required) continue;
      const ans = previewAnswers[q.id];
      const empty =
        ans === undefined ||
        (typeof ans === 'string' && !ans.trim()) ||
        (Array.isArray(ans) && ans.length === 0);
      if (empty) {
        onNotify('Required Field Missing', `Please answer "${q.title}".`, 'warning');
        return;
      }
    }

    const entry: FormSubmissionItem = {
      id: `resp-${Date.now()}`,
      submittedBy: `${actorName} (${actorEmail})`,
      submittedAt: new Date().toISOString(),
      answers: previewAnswers,
    };
    updateForm((prev) => ({
      ...prev,
      responses: [entry, ...prev.responses],
    }));
    setPreviewAnswers({});
    setActiveTab('responses');
    onNotify('Form Response Recorded', 'Submission saved to Form Responses.', 'success');
  };

  const handleExportResponsesCsv = () => {
    const headers = ['Submitted By', 'Submitted At', ...formState.questions.map((q) => q.title)];
    const rows = formState.responses.map((resp) => [
      resp.submittedBy,
      new Date(resp.submittedAt).toLocaleString(),
      ...formState.questions.map((q) => {
        const val = resp.answers[q.id];
        return Array.isArray(val) ? val.join('; ') : val || '';
      }),
    ]);
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = formState.title.replace(/[^a-z0-9_-]+/gi, '_');
    a.download = `${safeName}_responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFromGoogleForm = async () => {
    if (!googleFileId || !googleToken) return;
    setSyncingGoogle(true);
    try {
      const res = await fetchGoogleFormStructure(googleFileId);
      updateForm((prev) => ({
        ...prev,
        title: res.title,
        description: res.description,
        questions: res.questions.length > 0 ? res.questions : prev.questions,
      }));
      onNotify(
        'Imported Google Form',
        `Loaded ${res.questions.length} questions from "${res.title}".`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Form Import Failed',
        err instanceof Error ? err.message : 'Unable to read Google Form structure.',
        'error',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const handleSyncToGoogleForm = async () => {
    if (!googleFileId || !googleToken || readOnly) return;
    setSyncingGoogle(true);
    try {
      await syncQuestionsToGoogleForm(
        googleFileId,
        formState.title,
        formState.description,
        formState.questions,
      );
      onNotify(
        'Synced to Google Forms',
        'Updated form title, description, and questions on Google Forms.',
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Form Sync Failed',
        err instanceof Error ? err.message : 'Unable to push questions to Google Forms.',
        'error',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const handlePullGoogleResponses = async () => {
    if (!googleFileId || !googleToken) return;
    setSyncingGoogle(true);
    try {
      const remote = await fetchGoogleFormResponses(googleFileId);
      setFormState((prev) => {
        const existingIds = new Set(prev.responses.map((r) => r.id));
        const merged = [...remote.filter((r) => !existingIds.has(r.id)), ...prev.responses];
        const next = { ...prev, responses: merged };
        if (!readOnly) void persistForm(next);
        return next;
      });
      onNotify(
        'Google Responses Refreshed',
        `Loaded ${remote.length} submission(s) from Google Forms API.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Responses Notice',
        err instanceof Error ? err.message : 'Showing locally captured form responses.',
        'info',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  return (
    <div className="flex flex-col bg-[#F0EBF8]/45 dark:bg-slate-950">
      {/* Forms Top Sub-Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1.5">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setActiveTab('questions')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                activeTab === 'questions'
                  ? 'bg-[#7248B9] text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>Questions ({formState.questions.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              activeTab === 'preview'
                ? 'bg-[#7248B9] text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{readOnly ? 'Form Preview (Read-Only)' : 'Live Form Preview'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('responses')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              activeTab === 'responses'
                ? 'bg-[#7248B9] text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Responses ({formState.responses.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyShareLink()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[#7248B9] dark:text-violet-400" />
            )}
            <span>{copiedLink ? 'Link Copied' : 'Copy Form Link'}</span>
          </button>

          {googleFileId && googleToken && !readOnly && (
            <>
              <button
                type="button"
                disabled={syncingGoogle}
                onClick={() => void handleImportFromGoogleForm()}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 text-[11px] font-semibold text-[#7248B9] hover:bg-violet-50 disabled:opacity-60 dark:border-violet-900/60 dark:bg-slate-800 dark:text-violet-300 dark:hover:bg-violet-950/50"
              >
                {syncingGoogle ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudDownload className="h-3.5 w-3.5" />
                )}
                <span>Pull Google Form</span>
              </button>
              <button
                type="button"
                disabled={syncingGoogle}
                onClick={() => void handleSyncToGoogleForm()}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#7248B9] px-2.5 text-[11px] font-semibold text-white hover:bg-[#5E35B1] disabled:opacity-60"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                <span>Sync Questions</span>
              </button>
            </>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={() => void persistForm(formState)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300"
            >
              {saveState === 'saving' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              <span>Saved</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Forms Body */}
      <div className="max-h-[600px] overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* 1. QUESTIONS BUILDER */}
          {activeTab === 'questions' && !readOnly && (
            <>
              {/* Header Card */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="h-2.5 bg-[#7248B9]" />
                <div className="space-y-2.5 p-5">
                  <input
                    type="text"
                    value={formState.title}
                    onChange={(e) =>
                      updateForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Form Title"
                    className="w-full border-b border-transparent bg-transparent pb-1 text-xl font-bold text-slate-900 placeholder:text-slate-400 focus:border-[#7248B9] focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <textarea
                    rows={2}
                    value={formState.description}
                    onChange={(e) =>
                      updateForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Form description or instructions..."
                    className="w-full resize-none border-b border-transparent bg-transparent text-xs text-slate-600 placeholder:text-slate-400 focus:border-[#7248B9] focus:outline-none dark:text-slate-300 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              {/* Questions List */}
              {formState.questions.map((q, index) => {
                const hasOptions =
                  q.type === 'multiple_choice' ||
                  q.type === 'checkboxes' ||
                  q.type === 'dropdown';
                return (
                  <div
                    key={q.id}
                    className="space-y-3 rounded-xl border border-slate-200 border-l-4 border-l-[#7248B9] bg-white p-5 shadow-2xs dark:border-slate-800 dark:border-l-[#7248B9] dark:bg-slate-900"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      <input
                        type="text"
                        value={q.title}
                        onChange={(e) => handleUpdateQuestion(q.id, { title: e.target.value })}
                        placeholder="Question text"
                        className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#7248B9] focus:bg-white focus:outline-none sm:col-span-8 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
                      />
                      <select
                        aria-label="Question type"
                        value={q.type}
                        onChange={(e) =>
                          handleUpdateQuestion(q.id, {
                            type: e.target.value as FormQuestionType,
                          })
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-[#7248B9] focus:outline-none sm:col-span-4 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {(Object.keys(QUESTION_TYPE_LABELS) as FormQuestionType[]).map((t) => (
                          <option key={t} value={t}>
                            {QUESTION_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {hasOptions ? (
                      <div className="space-y-2 pl-1">
                        {(q.options ?? []).map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                              {q.type === 'dropdown' ? `${optIdx + 1}.` : q.type === 'checkboxes' ? '☐' : '○'}
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const nextOpts = [...(q.options ?? [])];
                                nextOpts[optIdx] = e.target.value;
                                handleUpdateQuestion(q.id, { options: nextOpts });
                              }}
                              className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-[#7248B9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            {(q.options?.length ?? 0) > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextOpts = (q.options ?? []).filter((_, i) => i !== optIdx);
                                  handleUpdateQuestion(q.id, { options: nextOpts });
                                }}
                                className="rounded p-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateQuestion(q.id, {
                              options: [
                                ...(q.options ?? []),
                                `Option ${(q.options?.length ?? 0) + 1}`,
                              ],
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#7248B9] hover:underline dark:text-violet-400"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add option</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                        {q.type === 'short_answer' && 'Short-answer text response field'}
                        {q.type === 'paragraph' && 'Long-answer paragraph text area'}
                        {q.type === 'file_upload' && 'File attachment upload field (PDF, Doc, Sheet, Image)'}
                        {q.type === 'date_time' && 'Date & Time selector input'}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(index, -1)}
                          disabled={index === 0}
                          title="Move Up"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(index, 1)}
                          disabled={index === formState.questions.length - 1}
                          title="Move Down"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateQuestion(index)}
                          title="Duplicate Question"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Delete Question"
                          className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            handleUpdateQuestion(q.id, { required: e.target.checked })
                          }
                          className="h-4 w-4 accent-[#7248B9]"
                        />
                        <span>Required</span>
                      </label>
                    </div>
                  </div>
                );
              })}

              {/* Add Question Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-violet-300 bg-white p-3 dark:border-violet-800/70 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleAddQuestion('short_answer')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#7248B9] px-4 text-xs font-semibold text-white hover:bg-[#5E35B1]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Question</span>
                </button>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ['multiple_choice', '+ Choice'],
                      ['checkboxes', '+ Checkboxes'],
                      ['dropdown', '+ Dropdown'],
                      ['file_upload', '+ File Upload'],
                      ['date_time', '+ Date/Time'],
                    ] as [FormQuestionType, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleAddQuestion(t)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-violet-50 hover:text-[#7248B9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-violet-950/60 dark:hover:text-violet-300"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 2. LIVE FORM PREVIEW */}
          {activeTab === 'preview' && (
            <form onSubmit={handleSubmitPreviewForm} className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="h-2.5 bg-[#7248B9]" />
                <div className="p-5">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{formState.title}</h2>
                  {formState.description && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {formState.description}
                    </p>
                  )}
                </div>
              </div>

              {formState.questions.map((q) => {
                const value = previewAnswers[q.id];
                return (
                  <div
                    key={q.id}
                    className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {q.title}
                      {q.required && <span className="ml-1 text-rose-600 dark:text-rose-400">*</span>}
                    </label>

                    {q.type === 'short_answer' && (
                      <input
                        type="text"
                        disabled={readOnly}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) =>
                          setPreviewAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        placeholder="Your answer"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#7248B9] focus:outline-none disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900"
                      />
                    )}

                    {q.type === 'paragraph' && (
                      <textarea
                        rows={3}
                        disabled={readOnly}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) =>
                          setPreviewAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        placeholder="Your detailed response"
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#7248B9] focus:outline-none disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900"
                      />
                    )}

                    {q.type === 'multiple_choice' && (
                      <div className="space-y-1.5">
                        {(q.options ?? []).map((opt) => (
                          <label
                            key={opt}
                            className="flex cursor-pointer items-center gap-2 text-xs text-slate-800 dark:text-slate-200"
                          >
                            <input
                              type="radio"
                              name={q.id}
                              disabled={readOnly}
                              checked={value === opt}
                              onChange={() =>
                                setPreviewAnswers((prev) => ({ ...prev, [q.id]: opt }))
                              }
                              className="h-4 w-4 accent-[#7248B9]"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === 'checkboxes' && (
                      <div className="space-y-1.5">
                        {(q.options ?? []).map((opt) => {
                          const arr = Array.isArray(value) ? value : [];
                          const checked = arr.includes(opt);
                          return (
                            <label
                              key={opt}
                              className="flex cursor-pointer items-center gap-2 text-xs text-slate-800 dark:text-slate-200"
                            >
                              <input
                                type="checkbox"
                                disabled={readOnly}
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? arr.filter((x) => x !== opt)
                                    : [...arr, opt];
                                  setPreviewAnswers((prev) => ({ ...prev, [q.id]: next }));
                                }}
                                className="h-4 w-4 accent-[#7248B9]"
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'dropdown' && (
                      <select
                        disabled={readOnly}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) =>
                          setPreviewAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#7248B9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="">Choose...</option>
                        {(q.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {q.type === 'date_time' && (
                      <input
                        type="datetime-local"
                        disabled={readOnly}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) =>
                          setPreviewAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#7248B9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    )}

                    {q.type === 'file_upload' && (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                        <Paperclip className="h-3.5 w-3.5 text-[#7248B9] dark:text-violet-400" />
                        <span>
                          {typeof value === 'string' && value ? value : 'Select file to attach'}
                        </span>
                        <input
                          type="file"
                          disabled={readOnly}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setPreviewAnswers((prev) => ({
                                ...prev,
                                [q.id]: `${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)`,
                              }));
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                );
              })}

              {!readOnly && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setPreviewAnswers({})}
                    className="text-xs font-semibold text-[#7248B9] hover:underline dark:text-violet-400"
                  >
                    Clear form
                  </button>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7248B9] px-5 text-xs font-semibold text-white hover:bg-[#5E35B1]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Submit Response</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* 3. RESPONSES VIEWER & CSV EXPORT */}
          {activeTab === 'responses' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {formState.responses.length} Response
                    {formState.responses.length === 1 ? '' : 's'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recorded submissions for {formState.title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {googleFileId && googleToken && (
                    <button
                      type="button"
                      disabled={syncingGoogle}
                      onClick={() => void handlePullGoogleResponses()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-[#7248B9] hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:bg-violet-950"
                    >
                      {syncingGoogle ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="h-3.5 w-3.5" />
                      )}
                      <span>Refresh Google Responses</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportResponsesCsv}
                    disabled={formState.responses.length === 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {formState.responses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  No responses captured yet. Switch to Live Form Preview to submit or test responses.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-2.5">Submitted By</th>
                        <th className="px-4 py-2.5">Timestamp</th>
                        {formState.questions.map((q) => (
                          <th key={q.id} className="px-4 py-2.5">
                            {q.title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {formState.responses.map((resp) => (
                        <tr key={resp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                            {resp.submittedBy}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {new Date(resp.submittedAt).toLocaleString()}
                          </td>
                          {formState.questions.map((q) => {
                            const ans = resp.answers[q.id];
                            const formatted = Array.isArray(ans) ? ans.join(', ') : ans || '—';
                            return (
                              <td key={q.id} className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                                {formatted}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
