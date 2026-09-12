import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Plus, Table2, Trash2 } from 'lucide-react';

export interface NotifyTable {
  headers: string[];
  rows: string[][];
}

interface TableMakerProps {
  /** The current saved table (or null when none). */
  value: NotifyTable | null;
  onSave: (t: NotifyTable) => void;
}

const inputCls =
  'h-8 w-full rounded-md border border-border/60 bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Dynamic table maker for notify notes (ticket 082) — headers + value rows,
 * add/remove columns and rows, "Save Table" commits into the note.
 */
export function TableMaker({ value, onSave }: TableMakerProps): ReactNode {
  const { t } = useI18n();
  const [headers, setHeaders] = useState<string[]>(['']);
  const [rows, setRows] = useState<string[][]>([['']]);
  const [saved, setSaved] = useState(false);

  // Sync from the saved value when it changes (e.g. reopened draft).
  useEffect(() => {
    if (value && Array.isArray(value.headers) && value.headers.some((h) => h)) {
      setHeaders(value.headers.map((h) => h ?? ''));
      setRows(
        Array.isArray(value.rows) && value.rows.length > 0
          ? value.rows.map((r) => (Array.isArray(r) ? r.map((c) => c ?? '') : []))
          : [Array(value.headers.length).fill('')],
      );
    } else {
      setHeaders(['']);
      setRows([['']]);
    }
    setSaved(false);
  }, [value]);

  const setHeader = (i: number, v: string): void => {
    setHeaders((prev) => prev.map((h, idx) => (idx === i ? v : h)));
    setSaved(false);
  };

  const setCell = (r: number, c: number, v: string): void => {
    setRows((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));
    setSaved(false);
  };

  const addHeader = (): void => {
    setHeaders((prev) => [...prev, '']);
    // Extend every row with one empty cell for the new column.
    setRows((prev) => prev.map((row) => [...row, '']));
    setSaved(false);
  };

  const removeHeader = (i: number): void => {
    setHeaders((prev) => prev.filter((_, idx) => idx !== i));
    setRows((prev) => prev.map((row) => row.filter((_, ci) => ci !== i)));
    setSaved(false);
  };

  const addRow = (): void => {
    setRows((prev) => [...prev, headers.map(() => '')]);
    setSaved(false);
  };

  const removeRow = (r: number): void => {
    setRows((prev) => prev.filter((_, ri) => ri !== r));
    setSaved(false);
  };

  const save = useCallback((): void => {
    const cleanHeaders = headers.map((h) => h.trim()).filter((h) => h);
    if (cleanHeaders.length === 0) {
      onSave({ headers: [], rows: [] });
      return;
    }
    const cleanRows = rows
      .filter((row) => row.some((c) => c.trim() !== ''))
      .map((row) => cleanHeaders.map((_, ci) => (row[ci] ?? '').trim()));
    onSave({ headers: cleanHeaders, rows: cleanRows });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [headers, rows, onSave]);

  const canSave = headers.some((h) => h.trim());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Table2 className="size-4 text-primary" />
          {t('vault.tableMaker')}
        </span>
        <Button type="button" size="xs" variant="outline" onClick={addHeader} className="gap-1">
          <Plus className="size-3" />
          {t('vault.addHeader')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              {headers.map((h, i) => (
                <th key={i} className="min-w-[8rem] p-1.5 align-top">
                  <div className="flex items-center gap-1">
                    <Input
                      value={h}
                      placeholder={`${t('vault.tableHeaders')} ${i + 1}`}
                      className={inputCls}
                      onChange={(e) => setHeader(i, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeHeader(i)}
                      title={t('vault.removeHeader')}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-90"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-8 p-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/40 last:border-0">
                {row.map((cell, ci) => (
                  <td key={ci} className="p-1.5">
                    <Input value={cell} className={inputCls} onChange={(e) => setCell(ri, ci, e.target.value)} />
                  </td>
                ))}
                <td className="p-1.5">
                  <button
                    type="button"
                    onClick={() => removeRow(ri)}
                    title={t('vault.removeRow')}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" size="xs" variant="outline" onClick={addRow} className="gap-1">
          <Plus className="size-3" />
          {t('vault.addRow')}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!canSave} className="gap-1.5">
          {saved ? <Check className="size-4 text-success" /> : <Table2 className="size-4" />}
          {t('vault.saveTable')}
        </Button>
      </div>
    </div>
  );
}