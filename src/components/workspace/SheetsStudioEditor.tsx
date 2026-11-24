import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownZA,
  ArrowUpAZ,
  Bold,
  CloudDownload,
  CloudUpload,
  Columns3,
  Download,
  Filter,
  Grid2x2,
  Italic,
  Loader2,
  Plus,
  Printer,
  Redo2,
  Rows3,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataService } from '../../services/dataService';
import {
  fetchGoogleSheetValues,
  updateGoogleSheetValues,
} from '../../services/googleWorkspaceService';
import {
  SheetCellData,
  SheetCellStyle,
  SheetNumberFormat,
  SheetStudioContent,
  SheetTabItem,
} from '../../types/nexops';

interface SheetsStudioEditorProps {
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

const DEFAULT_ROWS = 20;
const DEFAULT_COLS = 10;

const FILL_SWATCHES = ['', '#FEF9C3', '#DCFCE7', '#DBEAFE', '#FCE7F3', '#EDE9FE', '#F1F5F9'];
const TEXT_SWATCHES = ['#1F1F1F', '#0B57D0', '#047857', '#B45309', '#DC2626', '#7C3AED'];

function colIndexToLetter(index: number): string {
  let num = index + 1;
  let result = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

function letterToColIndex(letters: string): number {
  let idx = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseCellKey(key: string): { row: number; col: number } | null {
  const m = key.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return {
    col: letterToColIndex(m[1]),
    row: Number(m[2]) - 1,
  };
}

function makeCellKey(row: number, col: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

function evaluateSheetFormula(
  key: string,
  cells: Record<string, SheetCellData>,
  visited = new Set<string>(),
): string {
  const cell = cells[key];
  if (!cell || cell.raw === '') return '';
  const raw = cell.raw.trim();
  if (!raw.startsWith('=')) return cell.raw;

  if (visited.has(key)) return '#CYCLE!';
  visited.add(key);

  const expr = raw.slice(1).trim();

  const resolveNumeric = (ref: string): number => {
    const cleanRef = ref.trim().toUpperCase();
    const valStr = evaluateSheetFormula(cleanRef, cells, new Set(visited));
    const num = Number(valStr.replace(/[$,%]/g, ''));
    return Number.isFinite(num) ? num : 0;
  };

  const expandRangeValues = (argStr: string): number[] => {
    const parts = argStr.split(',').map((p) => p.trim());
    const nums: number[] = [];
    for (const part of parts) {
      if (part.includes(':')) {
        const [startRef, endRef] = part.split(':').map((s) => s.trim().toUpperCase());
        const sPos = parseCellKey(startRef);
        const ePos = parseCellKey(endRef);
        if (sPos && ePos) {
          const rMin = Math.min(sPos.row, ePos.row);
          const rMax = Math.max(sPos.row, ePos.row);
          const cMin = Math.min(sPos.col, ePos.col);
          const cMax = Math.max(sPos.col, ePos.col);
          for (let r = rMin; r <= rMax; r += 1) {
            for (let c = cMin; c <= cMax; c += 1) {
              const targetKey = makeCellKey(r, c);
              const rawCell = cells[targetKey]?.raw?.trim() ?? '';
              if (!rawCell) continue;
              const evaluated = evaluateSheetFormula(targetKey, cells, new Set(visited));
              const parsed = Number(evaluated.replace(/[$,%]/g, ''));
              if (Number.isFinite(parsed)) nums.push(parsed);
            }
          }
        }
      } else if (/^[A-Za-z]+\d+$/.test(part)) {
        const rawCell = cells[part.toUpperCase()]?.raw?.trim() ?? '';
        if (rawCell) {
          const evaluated = evaluateSheetFormula(part.toUpperCase(), cells, new Set(visited));
          const parsed = Number(evaluated.replace(/[$,%]/g, ''));
          if (Number.isFinite(parsed)) nums.push(parsed);
        }
      } else {
        const n = Number(part);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
    return nums;
  };

  try {
    const fnMatch = expr.match(/^(SUM|AVERAGE|AVG|COUNT|MIN|MAX)\((.+)\)$/i);
    if (fnMatch) {
      const fn = fnMatch[1].toUpperCase();
      const values = expandRangeValues(fnMatch[2]);
      if (fn === 'COUNT') return String(values.length);
      if (values.length === 0) return '0';
      if (fn === 'SUM') return String(values.reduce((acc, v) => acc + v, 0));
      if (fn === 'AVERAGE' || fn === 'AVG') {
        return String(values.reduce((acc, v) => acc + v, 0) / values.length);
      }
      if (fn === 'MIN') return String(Math.min(...values));
      if (fn === 'MAX') return String(Math.max(...values));
    }

    // Replace cell references in arithmetic expression e.g. A1+B1*2
    const replaced = expr.replace(/\b([A-Za-z]+\d+)\b/g, (match) => {
      return String(resolveNumeric(match));
    });

    // Allow only safe arithmetic tokens
    if (/^[0-9+\-*/().\s]+$/.test(replaced)) {
      const computed = Function(`"use strict"; return (${replaced});`)() as unknown;
      if (typeof computed === 'number' && Number.isFinite(computed)) {
        return String(Math.round(computed * 10000) / 10000);
      }
      return '#ERR!';
    }
    return '#FORMULA?';
  } catch {
    return '#ERR!';
  }
}

function formatDisplayValue(val: string, fmt?: SheetNumberFormat): string {
  if (!val || val.startsWith('#')) return val;
  if (!fmt || fmt === 'auto') return val;
  if (fmt === 'date') {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
    return val;
  }
  const num = Number(val.replace(/[$,%]/g, ''));
  if (!Number.isFinite(num)) return val;
  if (fmt === 'currency') {
    return num.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }
  if (fmt === 'percent') {
    return `${(num <= 1 && num >= -1 && num !== 0 && !val.includes('%') ? num * 100 : num).toFixed(1)}%`;
  }
  if (fmt === 'number') {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return val;
}

function createInitialSheetContent(): SheetStudioContent {
  const firstId = `sheet-${Date.now()}`;
  return {
    activeSheetId: firstId,
    sheets: [
      {
        id: firstId,
        name: 'Sheet1',
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        cells: {},
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function SheetsStudioEditor({
  docId,
  title,
  googleFileId,
  googleToken,
  readOnly,
  actorName,
  onNotify,
}: SheetsStudioEditorProps) {
  const [workbook, setWorkbook] = useState<SheetStudioContent>(() => createInitialSheetContent());
  const [undoStack, setUndoStack] = useState<SheetStudioContent[]>([]);
  const [redoStack, setRedoStack] = useState<SheetStudioContent[]>([]);
  const [selectedCell, setSelectedCell] = useState<string>('A1');
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [draftInput, setDraftInput] = useState<string>('');
  const [filterText, setFilterText] = useState<string>('');
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [syncingGoogle, setSyncingGoogle] = useState(false);

  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const local = dataService.workspaceStudio.loadLocal<SheetStudioContent>('sheets', docId);
    const initial = local?.sheets?.length ? local : createInitialSheetContent();
    setWorkbook(initial);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedCell('A1');
    setEditingCell(null);

    void dataService.workspaceStudio
      .fetchCloud<SheetStudioContent>('sheets', docId)
      .then((cloud) => {
        if (!active || !cloud?.sheets?.length) return;
        setWorkbook(cloud);
      });

    return () => {
      active = false;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [docId]);

  const activeSheet = useMemo<SheetTabItem>(() => {
    return (
      workbook.sheets.find((s) => s.id === workbook.activeSheetId) ||
      workbook.sheets[0]
    );
  }, [workbook]);

  const persistWorkbook = useCallback(
    async (next: SheetStudioContent) => {
      if (readOnly) return;
      setSaveState('saving');
      const stamped: SheetStudioContent = {
        ...next,
        updatedAt: new Date().toISOString(),
        updatedBy: actorName,
      };
      await dataService.workspaceStudio.save('sheets', docId, stamped, actorName);
      setSaveState('saved');
    },
    [actorName, docId, readOnly],
  );

  const commitWorkbookChange = useCallback(
    (updater: (prev: SheetStudioContent) => SheetStudioContent, recordHistory = true) => {
      if (readOnly) return;
      setWorkbook((prev) => {
        const next = updater(prev);
        if (recordHistory) {
          setUndoStack((u) => [...u.slice(-24), prev]);
          setRedoStack([]);
        }
        setSaveState('saving');
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          void persistWorkbook(next);
        }, 400);
        return next;
      });
    },
    [persistWorkbook, readOnly],
  );

  const handleUndo = () => {
    if (readOnly || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, workbook]);
    setWorkbook(previous);
    void persistWorkbook(previous);
  };

  const handleRedo = () => {
    if (readOnly || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, workbook]);
    setWorkbook(next);
    void persistWorkbook(next);
  };

  const updateActiveSheet = (updater: (sheet: SheetTabItem) => SheetTabItem) => {
    commitWorkbookChange((prev) => ({
      ...prev,
      sheets: prev.sheets.map((s) => (s.id === activeSheet.id ? updater(s) : s)),
    }));
  };

  const selectedCellData = activeSheet.cells[selectedCell];
  const selectedRaw = editingCell === selectedCell ? draftInput : selectedCellData?.raw ?? '';

  const commitCellValue = (cellKey: string, value: string) => {
    if (readOnly) return;
    updateActiveSheet((sheet) => {
      const nextCells = { ...sheet.cells };
      const prevCell = nextCells[cellKey];
      if (!value && !prevCell?.style) {
        delete nextCells[cellKey];
      } else {
        nextCells[cellKey] = {
          raw: value,
          style: prevCell?.style,
        };
      }
      return { ...sheet, cells: nextCells };
    });
  };

  const toggleCellStyle = (patch: Partial<SheetCellStyle>) => {
    if (readOnly) return;
    updateActiveSheet((sheet) => {
      const existing = sheet.cells[selectedCell] ?? { raw: '' };
      return {
        ...sheet,
        cells: {
          ...sheet.cells,
          [selectedCell]: {
            ...existing,
            style: {
              ...existing.style,
              ...patch,
            },
          },
        },
      };
    });
  };

  const moveSelection = (dRow: number, dCol: number) => {
    const pos = parseCellKey(selectedCell);
    if (!pos) return;
    const nextR = Math.max(0, Math.min(activeSheet.rows - 1, pos.row + dRow));
    const nextC = Math.max(0, Math.min(activeSheet.cols - 1, pos.col + dCol));
    setSelectedCell(makeCellKey(nextR, nextC));
  };

  const handleCellKeyDown = (e: KeyboardEvent<HTMLInputElement>, key: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCellValue(key, draftInput);
      setEditingCell(null);
      moveSelection(1, 0);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitCellValue(key, draftInput);
      setEditingCell(null);
      moveSelection(0, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleInsertRow = (offset: 0 | 1) => {
    if (readOnly) return;
    const pos = parseCellKey(selectedCell) ?? { row: 0, col: 0 };
    const insertAt = pos.row + offset;
    updateActiveSheet((sheet) => {
      const nextCells: Record<string, SheetCellData> = {};
      Object.entries(sheet.cells).forEach(([k, val]) => {
        const p = parseCellKey(k);
        if (!p) return;
        const targetRow = p.row >= insertAt ? p.row + 1 : p.row;
        nextCells[makeCellKey(targetRow, p.col)] = val;
      });
      return { ...sheet, rows: sheet.rows + 1, cells: nextCells };
    });
  };

  const handleDeleteRow = () => {
    if (readOnly || activeSheet.rows <= 1) return;
    const pos = parseCellKey(selectedCell) ?? { row: 0, col: 0 };
    updateActiveSheet((sheet) => {
      const nextCells: Record<string, SheetCellData> = {};
      Object.entries(sheet.cells).forEach(([k, val]) => {
        const p = parseCellKey(k);
        if (!p || p.row === pos.row) return;
        const targetRow = p.row > pos.row ? p.row - 1 : p.row;
        nextCells[makeCellKey(targetRow, p.col)] = val;
      });
      return { ...sheet, rows: Math.max(1, sheet.rows - 1), cells: nextCells };
    });
  };

  const handleInsertCol = (offset: 0 | 1) => {
    if (readOnly) return;
    const pos = parseCellKey(selectedCell) ?? { row: 0, col: 0 };
    const insertAt = pos.col + offset;
    updateActiveSheet((sheet) => {
      const nextCells: Record<string, SheetCellData> = {};
      Object.entries(sheet.cells).forEach(([k, val]) => {
        const p = parseCellKey(k);
        if (!p) return;
        const targetCol = p.col >= insertAt ? p.col + 1 : p.col;
        nextCells[makeCellKey(p.row, targetCol)] = val;
      });
      return { ...sheet, cols: sheet.cols + 1, cells: nextCells };
    });
  };

  const handleDeleteCol = () => {
    if (readOnly || activeSheet.cols <= 1) return;
    const pos = parseCellKey(selectedCell) ?? { row: 0, col: 0 };
    updateActiveSheet((sheet) => {
      const nextCells: Record<string, SheetCellData> = {};
      Object.entries(sheet.cells).forEach(([k, val]) => {
        const p = parseCellKey(k);
        if (!p || p.col === pos.col) return;
        const targetCol = p.col > pos.col ? p.col - 1 : p.col;
        nextCells[makeCellKey(p.row, targetCol)] = val;
      });
      return { ...sheet, cols: Math.max(1, sheet.cols - 1), cells: nextCells };
    });
  };

  const handleSortSelectedColumn = (direction: 'asc' | 'desc') => {
    if (readOnly) return;
    const pos = parseCellKey(selectedCell) ?? { row: 0, col: 0 };
    const sortCol = pos.col;
    updateActiveSheet((sheet) => {
      // Keep row 0 if it looks like a header and there's data below, or sort rows 1..rows-1 when row 0 has headers
      const startRow = 1;
      const rowData: { origRow: number; rowCells: Record<number, SheetCellData>; sortVal: string }[] = [];
      for (let r = startRow; r < sheet.rows; r += 1) {
        const rowCells: Record<number, SheetCellData> = {};
        let hasAny = false;
        for (let c = 0; c < sheet.cols; c += 1) {
          const cell = sheet.cells[makeCellKey(r, c)];
          if (cell) {
            rowCells[c] = cell;
            if (cell.raw.trim()) hasAny = true;
          }
        }
        if (hasAny) {
          const key = makeCellKey(r, sortCol);
          const evaluated = evaluateSheetFormula(key, sheet.cells);
          rowData.push({ origRow: r, rowCells, sortVal: evaluated });
        }
      }

      rowData.sort((a, b) => {
        const na = Number(a.sortVal);
        const nb = Number(b.sortVal);
        const cmp =
          Number.isFinite(na) && Number.isFinite(nb) && a.sortVal !== '' && b.sortVal !== ''
            ? na - nb
            : a.sortVal.localeCompare(b.sortVal, undefined, { numeric: true, sensitivity: 'base' });
        return direction === 'asc' ? cmp : -cmp;
      });

      const nextCells: Record<string, SheetCellData> = {};
      // Preserve row 0 header
      for (let c = 0; c < sheet.cols; c += 1) {
        const headerCell = sheet.cells[makeCellKey(0, c)];
        if (headerCell) nextCells[makeCellKey(0, c)] = headerCell;
      }
      rowData.forEach((entry, idx) => {
        const targetRow = startRow + idx;
        Object.entries(entry.rowCells).forEach(([colIdxStr, cell]) => {
          nextCells[makeCellKey(targetRow, Number(colIdxStr))] = cell;
        });
      });

      return { ...sheet, cells: nextCells };
    });
    onNotify(
      `Sorted Column ${colIndexToLetter(sortCol)}`,
      `Rows sorted ${direction === 'asc' ? 'A → Z' : 'Z → A'} (Header Row 1 preserved).`,
      'info',
    );
  };

  const handleAddSheetTab = () => {
    if (readOnly) return;
    const nextNum = workbook.sheets.length + 1;
    const newTab: SheetTabItem = {
      id: `sheet-${Date.now()}`,
      name: `Sheet${nextNum}`,
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      cells: {},
    };
    commitWorkbookChange((prev) => ({
      ...prev,
      activeSheetId: newTab.id,
      sheets: [...prev.sheets, newTab],
    }));
  };

  const handleDeleteSheetTab = (tabId: string) => {
    if (readOnly || workbook.sheets.length <= 1) return;
    commitWorkbookChange((prev) => {
      const remaining = prev.sheets.filter((s) => s.id !== tabId);
      return {
        ...prev,
        activeSheetId:
          prev.activeSheetId === tabId ? remaining[0].id : prev.activeSheetId,
        sheets: remaining,
      };
    });
  };

  const handleExportCsv = () => {
    const lines: string[] = [];
    for (let r = 0; r < activeSheet.rows; r += 1) {
      const rowVals: string[] = [];
      let rowHasValue = false;
      for (let c = 0; c < activeSheet.cols; c += 1) {
        const key = makeCellKey(r, c);
        const evaluated = evaluateSheetFormula(key, activeSheet.cells);
        if (evaluated) rowHasValue = true;
        rowVals.push(`"${evaluated.replace(/"/g, '""')}"`);
      }
      if (rowHasValue) lines.push(rowVals.join(','));
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = `${title}-${activeSheet.name}`.replace(/[^a-z0-9_-]+/gi, '_');
    a.download = `${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    let tableRowsHtml = '';
    for (let r = 0; r < activeSheet.rows; r += 1) {
      let cellsHtml = '';
      for (let c = 0; c < activeSheet.cols; c += 1) {
        const key = makeCellKey(r, c);
        const cell = activeSheet.cells[key];
        const val = formatDisplayValue(
          evaluateSheetFormula(key, activeSheet.cells),
          cell?.style?.numberFormat,
        );
        cellsHtml += `<td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:${
          cell?.style?.bold ? '700' : '400'
        };">${val.replace(/</g, '&lt;')}</td>`;
      }
      tableRowsHtml += `<tr>${cellsHtml}</tr>`;
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(
        `<!doctype html><html><head><title>${title} - ${activeSheet.name}</title><style>body{font-family:'Calibri','Carlito','Segoe UI',Arial,sans-serif;padding:24px;}table{border-collapse:collapse;width:100%;font-size:11pt;}</style></head><body><h2>${title} (${activeSheet.name})</h2><table>${tableRowsHtml}</table></body></html>`,
      );
      doc.close();
      window.setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        window.setTimeout(() => iframe.remove(), 1000);
      }, 150);
    }
  };

  const handlePullGoogleSheet = async () => {
    if (!googleFileId || !googleToken) return;
    setSyncingGoogle(true);
    try {
      const res = await fetchGoogleSheetValues(googleFileId);
      const nextCells: Record<string, SheetCellData> = {};
      const rowCount = Math.max(DEFAULT_ROWS, res.values.length + 4);
      let colCount = DEFAULT_COLS;
      res.values.forEach((rowArr, r) => {
        colCount = Math.max(colCount, rowArr.length + 2);
        rowArr.forEach((rawVal, c) => {
          if (rawVal !== '') {
            nextCells[makeCellKey(r, c)] = { raw: rawVal };
          }
        });
      });
      commitWorkbookChange(
        (prev) => ({
          ...prev,
          sheets: prev.sheets.map((s) =>
            s.id === activeSheet.id
              ? { ...s, name: res.sheetName || s.name, rows: rowCount, cols: colCount, cells: nextCells }
              : s,
          ),
        }),
        true,
      );
      onNotify(
        'Pulled Google Sheet Data',
        `Loaded ${res.values.length} rows from "${res.title}" (${res.sheetName}).`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Sheet Pull Failed',
        err instanceof Error ? err.message : 'Unable to fetch Google Sheet values.',
        'error',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const handlePushGoogleSheet = async () => {
    if (!googleFileId || !googleToken || readOnly) return;
    setSyncingGoogle(true);
    try {
      const matrix: string[][] = [];
      for (let r = 0; r < activeSheet.rows; r += 1) {
        const rowArr: string[] = [];
        for (let c = 0; c < activeSheet.cols; c += 1) {
          rowArr.push(activeSheet.cells[makeCellKey(r, c)]?.raw ?? '');
        }
        matrix.push(rowArr);
      }
      await updateGoogleSheetValues(googleFileId, activeSheet.name, matrix);
      onNotify(
        'Synced to Google Sheets',
        `Updated "${activeSheet.name}" values & formulas in Google Sheets.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Sheet Sync Failed',
        err instanceof Error ? err.message : 'Unable to push values to Google Sheets.',
        'error',
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const visibleRowIndices = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const indices: number[] = [];
    for (let r = 0; r < activeSheet.rows; r += 1) {
      if (!q || r === 0) {
        indices.push(r);
        continue;
      }
      let matched = false;
      for (let c = 0; c < activeSheet.cols; c += 1) {
        const evaluated = evaluateSheetFormula(makeCellKey(r, c), activeSheet.cells).toLowerCase();
        if (evaluated.includes(q)) {
          matched = true;
          break;
        }
      }
      if (matched) indices.push(r);
    }
    return indices;
  }, [activeSheet, filterText]);

  const activeColIdx = (parseCellKey(selectedCell) ?? { col: 0 }).col;

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900">
      {/* Spreadsheet Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-[#EDF2FA] px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="mr-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Read-Only View
          </span>
        )}

        <button
          type="button"
          onClick={handlePrint}
          title="Print Spreadsheet"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleExportCsv}
          title="Export CSV"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Download className="h-3.5 w-3.5" />
          <span>CSV</span>
        </button>

        {!readOnly && (
          <>
            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Number Formatting */}
            <select
              aria-label="Number format"
              value={selectedCellData?.style?.numberFormat || 'auto'}
              onChange={(e) =>
                toggleCellStyle({ numberFormat: e.target.value as SheetNumberFormat })
              }
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-[#1F1F1F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="auto">Auto</option>
              <option value="number">Number</option>
              <option value="currency">Currency ($)</option>
              <option value="percent">Percent (%)</option>
              <option value="date">Date</option>
            </select>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            <button
              type="button"
              onClick={() => toggleCellStyle({ bold: !selectedCellData?.style?.bold })}
              title="Bold"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                selectedCellData?.style?.bold
                  ? 'bg-[#D3E3FD] text-[#0B57D0] dark:bg-indigo-950/70 dark:text-indigo-300'
                  : 'text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleCellStyle({ italic: !selectedCellData?.style?.italic })}
              title="Italic"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                selectedCellData?.style?.italic
                  ? 'bg-[#D3E3FD] text-[#0B57D0] dark:bg-indigo-950/70 dark:text-indigo-300'
                  : 'text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleCellStyle({ border: !selectedCellData?.style?.border })}
              title="Toggle Cell Border"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                selectedCellData?.style?.border
                  ? 'bg-[#D3E3FD] text-[#0B57D0] dark:bg-indigo-950/70 dark:text-indigo-300'
                  : 'text-[#1F1F1F] hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Grid2x2 className="h-4 w-4" />
            </button>

            {/* Text Color Swatches */}
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 dark:border-slate-700 dark:bg-slate-950">
              {TEXT_SWATCHES.map((clr) => (
                <button
                  key={clr}
                  type="button"
                  onClick={() => toggleCellStyle({ textColor: clr })}
                  title={`Text ${clr}`}
                  className="h-3.5 w-3.5 rounded-full border border-slate-200 dark:border-slate-700"
                  style={{ backgroundColor: clr }}
                />
              ))}
            </div>

            {/* Fill Color Swatches */}
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 dark:border-slate-700 dark:bg-slate-950">
              {FILL_SWATCHES.map((clr, idx) => (
                <button
                  key={clr || `none-${idx}`}
                  type="button"
                  onClick={() => toggleCellStyle({ bgColor: clr })}
                  title={clr ? `Fill ${clr}` : 'Clear Fill'}
                  className="h-3.5 w-3.5 rounded border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: clr || '#ffffff' }}
                />
              ))}
            </div>

            {/* Alignment */}
            <button
              type="button"
              onClick={() => toggleCellStyle({ align: 'left' })}
              title="Align Left"
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleCellStyle({ align: 'center' })}
              title="Align Center"
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleCellStyle({ align: 'right' })}
              title="Align Right"
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Row / Column Controls */}
            <button
              type="button"
              onClick={() => handleInsertRow(1)}
              title="Insert Row Below"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Rows3 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>+Row</span>
            </button>
            <button
              type="button"
              onClick={handleDeleteRow}
              title="Delete Selected Row"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <span>-Row</span>
            </button>
            <button
              type="button"
              onClick={() => handleInsertCol(1)}
              title="Insert Column Right"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Columns3 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>+Col</span>
            </button>
            <button
              type="button"
              onClick={handleDeleteCol}
              title="Delete Selected Column"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <span>-Col</span>
            </button>

            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Sort A-Z / Z-A */}
            <button
              type="button"
              onClick={() => handleSortSelectedColumn('asc')}
              title={`Sort Column ${colIndexToLetter(activeColIdx)} A → Z`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowUpAZ className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSortSelectedColumn('desc')}
              title={`Sort Column ${colIndexToLetter(activeColIdx)} Z → A`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#444746] hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowDownZA className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Filter toggle (allowed for Viewers too) */}
        <button
          type="button"
          onClick={() => {
            setShowFilterBar((prev) => !prev);
            if (showFilterBar) setFilterText('');
          }}
          title="Filter Rows"
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${
            showFilterBar
              ? 'bg-[#D3E3FD] text-[#0B57D0] dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Filter</span>
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {googleFileId && googleToken && (
            <>
              <button
                type="button"
                disabled={syncingGoogle}
                onClick={() => void handlePullGoogleSheet()}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 text-[11px] font-semibold text-[#0F9D58] hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-900/60 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                {syncingGoogle ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudDownload className="h-3.5 w-3.5" />
                )}
                <span>Pull Sheet</span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  disabled={syncingGoogle}
                  onClick={() => void handlePushGoogleSheet()}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-[#0F9D58] px-2.5 text-[11px] font-semibold text-white hover:bg-[#0B8043] disabled:opacity-60"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  <span>Sync to Google</span>
                </button>
              )}
            </>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                void persistWorkbook(workbook);
                onNotify('Spreadsheet Saved', `"${title}" saved to NexOps workspace.`, 'success');
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
          )}
        </div>
      </div>

      {/* Formula Bar (fx) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
        <span className="inline-flex h-7 min-w-[54px] items-center justify-center rounded border border-slate-200 bg-slate-50 px-2 font-mono text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {selectedCell}
        </span>
        <span className="font-serif text-sm font-bold italic text-emerald-700 dark:text-emerald-400">fx</span>
        <input
          type="text"
          readOnly={readOnly}
          value={selectedRaw}
          onChange={(e) => {
            if (readOnly) return;
            setEditingCell(selectedCell);
            setDraftInput(e.target.value);
            commitCellValue(selectedCell, e.target.value);
          }}
          placeholder={readOnly ? '' : 'Enter value or formula (e.g. =SUM(A1:A5), =AVERAGE(B1:B10), =A1+B1)'}
          className="h-7 min-w-[200px] flex-1 rounded border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F9D58] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {!readOnly && (
          <div className="hidden items-center gap-1 lg:flex">
            {['=SUM(', '=AVERAGE(', '=COUNT(', '=MIN(', '=MAX('].map((fn) => (
              <button
                key={fn}
                type="button"
                onClick={() => {
                  setEditingCell(selectedCell);
                  setDraftInput(fn);
                  commitCellValue(selectedCell, fn);
                }}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300"
              >
                {fn}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Optional Filter Strip */}
      {showFilterBar && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-amber-50/60 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-amber-950/30">
          <Filter className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter spreadsheet rows matching keyword..."
            className="h-7 flex-1 rounded border border-amber-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:border-amber-900/60 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              className="text-xs font-semibold text-amber-800 underline dark:text-amber-300"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Spreadsheet Grid */}
      <div className="max-h-[520px] overflow-auto bg-slate-100 dark:bg-slate-950">
        <table className="border-collapse bg-white text-xs dark:bg-slate-900">
          <thead className="sticky top-0 z-10 bg-[#F8F9FA] dark:bg-slate-950">
            <tr>
              <th className="sticky left-0 z-20 h-7 w-11 border border-slate-300 bg-[#F1F3F4] text-center font-mono text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" />
              {Array.from({ length: activeSheet.cols }).map((_, c) => {
                const isActiveCol = activeColIdx === c;
                return (
                  <th
                    key={c}
                    className={`h-7 min-w-[110px] border border-slate-300 px-2 text-center font-mono text-[11px] font-semibold dark:border-slate-700 ${
                      isActiveCol
                        ? 'bg-[#D3E3FD] text-[#0B57D0] dark:bg-indigo-950/80 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {colIndexToLetter(c)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRowIndices.map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 h-7 w-11 border border-slate-300 bg-[#F1F3F4] text-center font-mono text-[11px] font-semibold text-slate-600 select-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {r + 1}
                </td>
                {Array.from({ length: activeSheet.cols }).map((_, c) => {
                  const key = makeCellKey(r, c);
                  const cell = activeSheet.cells[key];
                  const isSelected = selectedCell === key;
                  const isEditing = !readOnly && editingCell === key;
                  const evaluated = evaluateSheetFormula(key, activeSheet.cells);
                  const display = formatDisplayValue(evaluated, cell?.style?.numberFormat);

                  return (
                    <td
                      key={key}
                      onClick={() => {
                        if (editingCell && editingCell !== key) {
                          commitCellValue(editingCell, draftInput);
                          setEditingCell(null);
                        }
                        setSelectedCell(key);
                      }}
                      onDoubleClick={() => {
                        if (readOnly) return;
                        setSelectedCell(key);
                        setEditingCell(key);
                        setDraftInput(cell?.raw ?? '');
                      }}
                      style={{
                        backgroundColor: cell?.style?.bgColor || undefined,
                        color: cell?.style?.textColor || (cell?.style?.bgColor ? '#1F1F1F' : undefined),
                        fontWeight: cell?.style?.bold ? 700 : 400,
                        fontStyle: cell?.style?.italic ? 'italic' : 'normal',
                        textAlign: cell?.style?.align || (r === 0 ? 'left' : 'left'),
                        boxShadow: cell?.style?.border
                          ? 'inset 0 0 0 1px rgba(100,116,139,0.75)'
                          : undefined,
                      }}
                      className={`h-7 min-w-[110px] max-w-[220px] border border-slate-200 px-2 py-0.5 text-[#1F1F1F] select-none dark:border-slate-800 dark:text-slate-100 ${
                        isSelected ? 'outline-2 -outline-offset-2 outline-[#0F9D58]' : ''
                      }`}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          value={draftInput}
                          onChange={(e) => setDraftInput(e.target.value)}
                          onBlur={() => {
                            commitCellValue(key, draftInput);
                            setEditingCell(null);
                          }}
                          onKeyDown={(e) => handleCellKeyDown(e, key)}
                          className="h-full w-full bg-white text-xs text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
                        />
                      ) : (
                        <div className="truncate">{display}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Multi-Sheet Bottom Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-[#F8F9FA] px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex flex-wrap items-center gap-1.5">
          {!readOnly && (
            <button
              type="button"
              onClick={handleAddSheetTab}
              title="Add New Sheet Tab"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-400"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {workbook.sheets.map((tab) => {
            const isTabActive = tab.id === activeSheet.id;
            return (
              <div
                key={tab.id}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  isTabActive
                    ? 'border-emerald-300 bg-white text-[#0F9D58] shadow-2xs dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {!readOnly && renamingSheetId === tab.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      const clean = renameValue.trim();
                      if (clean) {
                        commitWorkbookChange((prev) => ({
                          ...prev,
                          sheets: prev.sheets.map((s) =>
                            s.id === tab.id ? { ...s, name: clean } : s,
                          ),
                        }));
                      }
                      setRenamingSheetId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-20 rounded border border-emerald-400 bg-white px-1 text-xs text-slate-900 focus:outline-none dark:border-emerald-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setWorkbook((prev) => ({ ...prev, activeSheetId: tab.id }));
                      setSelectedCell('A1');
                    }}
                    onDoubleClick={() => {
                      if (readOnly) return;
                      setRenamingSheetId(tab.id);
                      setRenameValue(tab.name);
                    }}
                    title={readOnly ? tab.name : 'Click to switch, double-click to rename'}
                  >
                    {tab.name}
                  </button>
                )}
                {!readOnly && workbook.sheets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSheetTab(tab.id)}
                    title="Delete Sheet"
                    className="rounded p-0.5 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Double-click any cell to edit · Formulas: =SUM(), =AVERAGE(), =COUNT(), =MIN(), =MAX()
        </span>
      </div>
    </div>
  );
}
