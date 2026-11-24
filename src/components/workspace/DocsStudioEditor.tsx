import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  CloudDownload,
  CloudUpload,
  Download,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Palette,
  Printer,
  Redo2,
  RemoveFormatting,
  Save,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataService } from '../../services/dataService';
import {
  fetchGoogleDocPlainText,
  syncTextToGoogleDoc,
} from '../../services/googleWorkspaceService';
import { DocStudioContent } from '../../types/nexops';

interface DocsStudioEditorProps {
  docId: string;
  title: string;
  googleFileId?: string | null;
  googleToken: string | null;
  readOnly: boolean;
  actorName: string;
  onNotify: (
    title: string,
    description: string,
    variant?: 'success' | 'error' | 'warning' | 'info',
  ) => void;
}

const FONT_OPTIONS = [
  { label: 'Calibri (Corporate)', value: 'Calibri, "Segoe UI", Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
];

const TEXT_COLORS = [
  '#1F1F1F',
  '#475569',
  '#0B57D0',
  '#1E40AF',
  '#047857',
  '#B45309',
  '#DC2626',
  '#7C3AED',
];

const HIGHLIGHT_COLORS = [
  'transparent',
  '#FEF08A',
  '#BBF7D0',
  '#BFDBFE',
  '#E9D5FF',
  '#FED7AA',
  '#FECACA',
];

function sanitizeLoadedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function DocsStudioEditor({
  docId,
  title,
  googleFileId,
  googleToken,
  readOnly,
  actorName,
  onNotify,
}: DocsStudioEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [defaultFont, setDefaultFont] = useState(FONT_OPTIONS[0].value);
  const [fontSize, setFontSize] = useState('3'); // execCommand fontSize 1..7 ('3' ~ 12pt)
  const [blockTag, setBlockTag] = useState<'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE'>('P');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [syncingGoogle, setSyncingGoogle] = useState(false);

  // Popovers (no window.prompt)
  const [openPopover, setOpenPopover] = useState<
    'none' | 'textColor' | 'highlight' | 'link' | 'table'
  >('none');
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const saveTimerRef = useRef<number | null>(null);

  // Load initial document content from localStorage -> Supabase cloud
  useEffect(() => {
    let active = true;
    const initialHtml = `<h1 style="font-size:20pt;font-weight:700;margin-bottom:8px;">${escapeHtml(
      title,
    )}</h1><p>Start typing your corporate document here...</p>`;

    const local = dataService.workspaceStudio.loadLocal<DocStudioContent>('docs', docId);
    const resolvedHtml = local?.html ? sanitizeLoadedHtml(local.html) : initialHtml;
    setHtmlContent(resolvedHtml);
    if (local?.defaultFont) setDefaultFont(local.defaultFont);
    if (local?.updatedAt) setLastSavedAt(local.updatedAt);

    if (editorRef.current) {
      editorRef.current.innerHTML = resolvedHtml;
    }

    void dataService.workspaceStudio
      .fetchCloud<DocStudioContent>('docs', docId)
      .then((cloud) => {
        if (!active || !cloud?.html) return;
        const safe = sanitizeLoadedHtml(cloud.html);
        setHtmlContent(safe);
        if (cloud.defaultFont) setDefaultFont(cloud.defaultFont);
        setLastSavedAt(cloud.updatedAt);
        if (editorRef.current && editorRef.current.innerHTML !== safe) {
          editorRef.current.innerHTML = safe;
        }
      });

    return () => {
      active = false;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [docId, title]);

  const persistDocument = useCallback(
    async (nextHtml: string, nextFont = defaultFont) => {
      if (readOnly) return;
      setSaveState('saving');
      const now = new Date().toISOString();
      const payload: DocStudioContent = {
        html: nextHtml,
        defaultFont: nextFont,
        updatedAt: now,
        updatedBy: actorName,
      };
      await dataService.workspaceStudio.save('docs', docId, payload, actorName);
      setLastSavedAt(now);
      setSaveState('saved');
    },
    [actorName, defaultFont, docId, readOnly],
  );

  const scheduleSave = useCallback(
    (nextHtml: string, nextFont = defaultFont) => {
      if (readOnly) return;
      setSaveState('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void persistDocument(nextHtml, nextFont);
      }, 450);
    },
    [defaultFont, persistDocument, readOnly],
  );

  const captureSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const handleEditorInput = () => {
    if (!editorRef.current || readOnly) return;
    const current = editorRef.current.innerHTML;
    setHtmlContent(current);
    scheduleSave(current);
  };

  const execCommand = (command: string, value?: string) => {
    if (readOnly) return;
    restoreSelection();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const handleBlockChange = (tag: 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE') => {
    setBlockTag(tag);
    execCommand('formatBlock', tag);
  };

  const handleFontChange = (fontVal: string) => {
    setDefaultFont(fontVal);
    execCommand('fontName', fontVal);
    if (editorRef.current) {
      scheduleSave(editorRef.current.innerHTML, fontVal);
    }
  };

  const handleFontSizeChange = (sizeVal: string) => {
    setFontSize(sizeVal);
    execCommand('fontSize', sizeVal);
  };

  const handleInsertLinkSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const cleanUrl = linkUrl.trim();
    if (!cleanUrl) return;
    const normalizedUrl =
      cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
        ? cleanUrl
        : `https://${cleanUrl}`;
    const label = linkText.trim() || normalizedUrl;
    restoreSelection();
    const anchorHtml = `<a href="${escapeHtml(
      normalizedUrl,
    )}" target="_blank" rel="noopener noreferrer" style="color:#0B57D0;text-decoration:underline;">${escapeHtml(
      label,
    )}</a>&nbsp;`;
    document.execCommand('insertHTML', false, anchorHtml);
    handleEditorInput();
    setLinkText('');
    setLinkUrl('');
    setOpenPopover('none');
  };

  const handleInsertTableSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const rCount = Math.max(1, Math.min(12, tableRows));
    const cCount = Math.max(1, Math.min(8, tableCols));
    let rowsHtml = '';
    for (let r = 0; r < rCount; r += 1) {
      let cellsHtml = '';
      for (let c = 0; c < cCount; c += 1) {
        const isHeader = r === 0;
        cellsHtml += isHeader
          ? `<th style="border:1px solid #cbd5e1;background:#f8fafc;padding:6px 10px;text-align:left;font-weight:700;">Header ${
              c + 1
            }</th>`
          : `<td style="border:1px solid #cbd5e1;padding:6px 10px;">Cell</td>`;
      }
      rowsHtml += `<tr>${cellsHtml}</tr>`;
    }
    const tableHtml = `<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:11pt;"><tbody>${rowsHtml}</tbody></table><p><br/></p>`;
    restoreSelection();
    document.execCommand('insertHTML', false, tableHtml);
    handleEditorInput();
    setOpenPopover('none');
  };

  const handlePrint = () => {
    const content = editorRef.current?.innerHTML ?? htmlContent;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(
        `<!doctype html><html><head><title>${escapeHtml(
          title,
        )}</title><style>body{font-family:${defaultFont};color:#1F1F1F;padding:36px;line-height:1.6;}h1,h2,h3{margin:12px 0 6px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #cbd5e1;padding:6px 10px;}</style></head><body>${content}</body></html>`,
      );
      doc.close();
      window.setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        window.setTimeout(() => iframe.remove(), 1000);
      }, 150);
    }
  };

  const handleExportFile = (format: 'doc' | 'txt') => {
    const safeName = title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'NexOps_Document';
    if (format === 'txt') {
      const text = editorRef.current?.innerText ?? '';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const htmlBody = editorRef.current?.innerHTML ?? htmlContent;
    const docMarkup = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      title,
    )}</title><style>body{font-family:${defaultFont};font-size:11pt;color:#1F1F1F;line-height:1.5;}</style></head><body>${htmlBody}</body></html>`;
    const blob = new Blob(['\ufeff', docMarkup], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePullFromGoogle = async () => {
    if (!googleFileId || !googleToken) return;
    setSyncingGoogle(true);
    try {
      const res = await fetchGoogleDocPlainText(googleFileId);
      const paragraphs = res.text
        ? res.text
            .split(/\n+/)
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join('')
        : `<p></p>`;
      const nextHtml = `<h1 style="font-size:20pt;font-weight:700;margin-bottom:8px;">${escapeHtml(
        res.title,
      )}</h1>${paragraphs}`;
      setHtmlContent(nextHtml);
      if (editorRef.current) editorRef.current.innerHTML = nextHtml;
      await persistDocument(nextHtml);
      onNotify('Pulled from Google Docs', `Loaded latest text from "${res.title}".`, 'success');
    } catch (err) {
      onNotify(
        'Google Doc Pull Failed',
        err instanceof Error ? err.message : 'Unable to pull Google Doc content.',
        'error',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const handlePushToGoogle = async () => {
    if (!googleFileId || !googleToken || readOnly) return;
    setSyncingGoogle(true);
    try {
      const plain = editorRef.current?.innerText?.trim() || '';
      await syncTextToGoogleDoc(googleFileId, plain);
      onNotify(
        'Synced to Google Docs',
        `Document text pushed cleanly to Google Docs (${googleFileId.slice(0, 10)}…).`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Doc Push Failed',
        err instanceof Error ? err.message : 'Unable to sync text to Google Doc.',
        'error',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const stats = useMemo(() => {
    const plain = htmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = plain ? plain.split(' ').length : 0;
    return { words, chars: plain.length };
  }, [htmlContent]);

  return (
    <div className="flex flex-col bg-[#F8F9FA] dark:bg-slate-950">
      {/* Google Docs Style Formatting Toolbar */}
      <div className="relative border-b border-slate-200 bg-[#EDF2FA] px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        {readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Read-Only Document Preview (Viewer Role)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportFile('doc')}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export .doc</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {/* Undo / Redo / Print / Export */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('undo')}
              title="Undo"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('redo')}
              title="Redo"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              title="Print Document"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Printer className="h-4 w-4" />
            </button>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Headings / Normal */}
            <select
              aria-label="Text style"
              value={blockTag}
              onChange={(e) =>
                handleBlockChange(e.target.value as 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE')
              }
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-[#1F1F1F] focus:border-[#0B57D0] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400"
            >
              <option value="P">Normal text</option>
              <option value="H1">Heading 1</option>
              <option value="H2">Heading 2</option>
              <option value="H3">Heading 3</option>
              <option value="BLOCKQUOTE">Quote</option>
            </select>

            {/* Font Family */}
            <select
              aria-label="Font family"
              value={defaultFont}
              onChange={(e) => handleFontChange(e.target.value)}
              className="h-8 max-w-[140px] rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-[#1F1F1F] focus:border-[#0B57D0] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Font Size */}
            <select
              aria-label="Font size"
              value={fontSize}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-[#1F1F1F] focus:border-[#0B57D0] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400"
            >
              <option value="2">10pt</option>
              <option value="3">12pt</option>
              <option value="4">14pt</option>
              <option value="5">18pt</option>
              <option value="6">24pt</option>
              <option value="7">32pt</option>
            </select>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Inline Formatting */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('bold')}
              title="Bold (Ctrl+B)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('italic')}
              title="Italic (Ctrl+I)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('underline')}
              title="Underline (Ctrl+U)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Underline className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('strikeThrough')}
              title="Strikethrough"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Strikethrough className="h-4 w-4" />
            </button>

            {/* Text Color & Highlight Color Popovers */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  captureSelection();
                }}
                onClick={() =>
                  setOpenPopover((p) => (p === 'textColor' ? 'none' : 'textColor'))
                }
                title="Text Color"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white dark:hover:bg-slate-800 ${
                  openPopover === 'textColor'
                    ? 'bg-white text-[#0B57D0] dark:bg-slate-800 dark:text-indigo-400'
                    : 'text-[#1F1F1F] dark:text-slate-200'
                }`}
              >
                <Palette className="h-4 w-4" />
              </button>
              {openPopover === 'textColor' && (
                <div className="absolute top-10 left-0 z-30 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {TEXT_COLORS.map((clr) => (
                    <button
                      key={clr}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        execCommand('foreColor', clr);
                        setOpenPopover('none');
                      }}
                      className="h-5 w-5 rounded-full border border-slate-200 dark:border-slate-700"
                      style={{ backgroundColor: clr }}
                      title={clr}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  captureSelection();
                }}
                onClick={() =>
                  setOpenPopover((p) => (p === 'highlight' ? 'none' : 'highlight'))
                }
                title="Highlight Color"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white dark:hover:bg-slate-800 ${
                  openPopover === 'highlight'
                    ? 'bg-white text-[#0B57D0] dark:bg-slate-800 dark:text-indigo-400'
                    : 'text-[#1F1F1F] dark:text-slate-200'
                }`}
              >
                <Highlighter className="h-4 w-4" />
              </button>
              {openPopover === 'highlight' && (
                <div className="absolute top-10 left-0 z-30 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {HIGHLIGHT_COLORS.map((clr) => (
                    <button
                      key={clr}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        execCommand('hiliteColor', clr);
                        setOpenPopover('none');
                      }}
                      className="h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600"
                      style={{ backgroundColor: clr === 'transparent' ? '#ffffff' : clr }}
                      title={clr === 'transparent' ? 'Clear highlight' : clr}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Alignment */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('justifyLeft')}
              title="Align Left"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('justifyCenter')}
              title="Align Center"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignCenter className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('justifyRight')}
              title="Align Right"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('justifyFull')}
              title="Justify"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignJustify className="h-4 w-4" />
            </button>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Lists & Indent */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('insertUnorderedList')}
              title="Bulleted List"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('insertOrderedList')}
              title="Numbered List"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('outdent')}
              title="Decrease Indent"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <IndentDecrease className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('indent')}
              title="Increase Indent"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <IndentIncrease className="h-4 w-4" />
            </button>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Insert Link & Insert Table & Divider & Clear Formatting */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  captureSelection();
                }}
                onClick={() => setOpenPopover((p) => (p === 'link' ? 'none' : 'link'))}
                title="Insert Link"
                className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 ${
                  openPopover === 'link'
                    ? 'bg-white text-[#0B57D0] dark:bg-slate-800 dark:text-indigo-400'
                    : 'text-[#444746] dark:text-slate-300'
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Link</span>
              </button>
              {openPopover === 'link' && (
                <form
                  onSubmit={handleInsertLinkSubmit}
                  className="absolute top-10 left-0 z-30 w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">Insert Clickable Link</p>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    placeholder="Display text (optional)"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B57D0] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    required
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://company.com/report"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B57D0] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOpenPopover('none')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#0B57D0] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0842A0]"
                    >
                      Insert
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  captureSelection();
                }}
                onClick={() => setOpenPopover((p) => (p === 'table' ? 'none' : 'table'))}
                title="Insert Table"
                className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 ${
                  openPopover === 'table'
                    ? 'bg-white text-[#0B57D0] dark:bg-slate-800 dark:text-indigo-400'
                    : 'text-[#444746] dark:text-slate-300'
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              {openPopover === 'table' && (
                <form
                  onSubmit={handleInsertTableSubmit}
                  className="absolute top-10 left-0 z-30 w-56 space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">Insert Table Grid</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Rows</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={tableRows}
                        onChange={(e) => setTableRows(Number(e.target.value) || 1)}
                        className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Columns</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={tableCols}
                        onChange={(e) => setTableCols(Number(e.target.value) || 1)}
                        className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOpenPopover('none')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#0B57D0] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0842A0]"
                    >
                      Insert
                    </button>
                  </div>
                </form>
              )}
            </div>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('insertHorizontalRule')}
              title="Insert Horizontal Divider"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCommand('removeFormat')}
              title="Clear Formatting"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RemoveFormatting className="h-4 w-4" />
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {googleFileId && googleToken && (
                <>
                  <button
                    type="button"
                    disabled={syncingGoogle}
                    onClick={() => void handlePullFromGoogle()}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 text-[11px] font-semibold text-[#1A73E8] hover:bg-blue-50 disabled:opacity-60 dark:border-blue-900/60 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-blue-950/50"
                  >
                    {syncingGoogle ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CloudDownload className="h-3.5 w-3.5" />
                    )}
                    <span>Pull Google Doc</span>
                  </button>
                  <button
                    type="button"
                    disabled={syncingGoogle}
                    onClick={() => void handlePushToGoogle()}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-[#1A73E8] px-2.5 text-[11px] font-semibold text-white hover:bg-[#1557B0] disabled:opacity-60"
                  >
                    <CloudUpload className="h-3.5 w-3.5" />
                    <span>Sync to Google</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleExportFile('doc')}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>.doc</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (editorRef.current) {
                    void persistDocument(editorRef.current.innerHTML);
                    onNotify('Document Saved', `"${title}" saved to NexOps workspace.`, 'success');
                  }
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                {saveState === 'saving' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                <span>{saveState === 'saving' ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Document Page Canvas */}
      <div className="flex-1 overflow-y-auto bg-[#F1F3F4] p-4 sm:p-8 dark:bg-slate-950">
        <div className="mx-auto min-h-[600px] max-w-[816px] rounded-lg border border-slate-200 bg-white px-8 py-10 shadow-sm sm:px-14 sm:py-12 dark:border-slate-700">
          <div
            ref={editorRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            style={{ fontFamily: defaultFont }}
            className="min-h-[500px] text-[11pt] leading-relaxed text-[#1F1F1F] focus:outline-none [&_a]:text-[#0B57D0] [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          />
        </div>
      </div>

      {/* Document Status Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {stats.words} words · {stats.chars} characters
          </span>
          {lastSavedAt && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span>Interactive Calibri Document Studio · Persisted to NexOps Workspace</span>
      </div>
    </div>
  );
}
