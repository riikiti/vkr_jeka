import { useState } from 'react';

interface ExportData {
  /** Experiment ID */
  id: string;
  /** Full config used */
  config: Record<string, unknown>;
  /** Status */
  status: string;
  /** Full results object */
  results: Record<string, unknown> | null;
  /** Error string if any */
  error?: string | null;
  /** Export timestamp */
  exportedAt?: string;
}

function buildExportPayload(data: ExportData): Record<string, unknown> {
  return {
    _meta: {
      format: 'DiffSAT Algorithm Experiment',
      version: '0.2.0-beta',
      exportedAt: data.exportedAt ?? new Date().toISOString(),
    },
    id: data.id,
    status: data.status,
    config: data.config,
    results: data.results,
    error: data.error ?? null,
  };
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(data: ExportData) {
  const payload = buildExportPayload(data);
  const json = JSON.stringify(payload, null, 2);
  const hashFunc = (data.config.hash_function as string) ?? 'unknown';
  const rounds = (data.config.num_rounds as number) ?? 0;
  downloadFile(json, `experiment_${hashFunc}_r${rounds}_${data.id}.json`, 'application/json');
}

// ── PDF generation (plain text layout rendered to PDF via browser print) ──

function formatHexWords(words: string[]): string {
  return words
    .map((w, i) => w + ((i + 1) % 4 === 0 && i < words.length - 1 ? '\n' : ' '))
    .join('');
}

function exportPDF(data: ExportData) {
  const p = buildExportPayload(data);
  const cfg = p.config as Record<string, unknown>;
  const res = p.results as Record<string, unknown> | null;
  const meta = p._meta as Record<string, string>;

  const HASH_LABELS: Record<string, string> = {
    sha256: 'SHA-256', md5: 'MD5', md4: 'MD4',
  };
  const METHOD_LABELS: Record<string, string> = {
    combined: 'Комбинированный (Дифф + SAT)',
    pure_sat: 'Чистый SAT',
    pure_differential: 'Чистый дифференциальный',
  };
  const STRATEGY_LABELS: Record<string, string> = {
    sequential: 'Последовательная',
    iterative: 'Итеративная',
    hybrid: 'Гибридная',
  };
  const RESULT_LABELS: Record<string, string> = {
    SAT: 'SAT (коллизия найдена)',
    SATISFIABLE: 'SAT (коллизия найдена)',
    UNSAT: 'UNSAT (невозможно)',
    UNSATISFIABLE: 'UNSAT (невозможно)',
    TIMEOUT: 'TIMEOUT',
  };

  const hashLabel = HASH_LABELS[(cfg.hash_function as string)] ?? (cfg.hash_function as string);

  const lines: string[] = [];
  const hr = () => lines.push('─'.repeat(72));
  const blank = () => lines.push('');

  lines.push('DIFFSAT ALGORITHM — ОТЧЁТ ОБ ЭКСПЕРИМЕНТЕ');
  hr();
  lines.push(`Дата экспорта:  ${meta.exportedAt}`);
  lines.push(`ID:             ${p.id}`);
  lines.push(`Статус:         ${p.status}`);
  blank();

  lines.push('КОНФИГУРАЦИЯ');
  hr();
  lines.push(`Хэш-функция:      ${hashLabel}`);
  lines.push(`Раунды:            ${cfg.num_rounds}`);
  lines.push(`Метод:             ${METHOD_LABELS[cfg.method as string] ?? cfg.method}`);
  if (cfg.method === 'combined') {
    lines.push(`Стратегия:         ${STRATEGY_LABELS[cfg.combined_strategy as string] ?? cfg.combined_strategy}`);
  }
  lines.push(`SAT-решатель:      ${cfg.solver}`);
  lines.push(`Таймаут:           ${cfg.timeout} с`);
  lines.push(`Макс. разностей:   ${cfg.max_characteristics}`);
  lines.push(`Seed:              ${cfg.seed}`);
  blank();

  if (res) {
    lines.push('РЕЗУЛЬТАТЫ');
    hr();
    lines.push(`Коллизия найдена:  ${res.success ? 'ДА' : 'НЕТ'}`);
    lines.push(`Общее время:       ${(res.total_time as number)?.toFixed(3) ?? '—'} с`);
    lines.push(`Время решателя:    ${(res.solving_time as number)?.toFixed(3) ?? '—'} с`);
    lines.push(`Разностей провер.: ${res.characteristics_tried ?? '—'}`);
    blank();

    // Attempts log
    const attempts = res.attempts as Array<{
      diff: string[]; result: string; solve_time: number;
      encoding_time: number; hamming_weight: number;
    }> | undefined;
    if (attempts && attempts.length > 0) {
      lines.push('ЛОГ ПОПЫТОК');
      hr();
      attempts.forEach((a, i) => {
        lines.push(`#${i + 1}  ${RESULT_LABELS[a.result] ?? a.result}  время: ${a.solve_time.toFixed(2)}с  HW: ${a.hamming_weight}`);
        const active = a.diff.filter(w => w !== '0x00000000');
        if (active.length > 0 && active.length <= 4) {
          const parts = a.diff
            .map((w, idx) => ({ w, idx }))
            .filter(x => x.w !== '0x00000000')
            .map(x => `W[${x.idx}]=${x.w}`);
          lines.push(`     ΔM: ${parts.join(', ')}`);
        } else if (active.length > 4) {
          lines.push(`     ΔM: ${active.length} ненулевых слов из 16`);
        }
      });
      blank();
    }

    // Collision details
    if (res.success && res.m1_words && res.m2_words) {
      const m1 = res.m1_words as string[];
      const m2 = res.m2_words as string[];

      lines.push('НАЙДЕННАЯ КОЛЛИЗИЯ');
      hr();
      lines.push(`Сообщение M1 (16 слов):`);
      lines.push(formatHexWords(m1));

      lines.push(`Сообщение M2 (16 слов):`);
      lines.push(formatHexWords(m2));

      if (res.xor_diff) {
        const xor = res.xor_diff as string[];
        lines.push(`XOR-разность (M1 ⊕ M2), вес Хэмминга: ${res.diff_hamming_weight ?? '?'}:`);
        lines.push(formatHexWords(xor));
      }

      if (res.hash1 && res.hash2) {
        lines.push(`H(M1) = ${res.hash1}`);
        lines.push(`H(M2) = ${res.hash2}`);
        lines.push(`Хэши совпадают: ${res.hashes_match ? 'ДА' : 'НЕТ'}`);
        blank();
      }

      // Solver stats
      const ss = res.solver_stats as Record<string, number> | undefined;
      if (ss) {
        lines.push('СТАТИСТИКА РЕШАТЕЛЯ');
        hr();
        lines.push(`Конфликты:      ${(ss.num_conflicts ?? 0).toLocaleString()}`);
        lines.push(`Решения:        ${(ss.num_decisions ?? 0).toLocaleString()}`);
        lines.push(`Пропагации:     ${(ss.num_propagations ?? 0).toLocaleString()}`);
        lines.push(`Рестарты:       ${(ss.num_restarts ?? 0).toLocaleString()}`);
        lines.push(`Выуч. дизъюнкт: ${(ss.num_learnt_clauses ?? 0).toLocaleString()}`);
        blank();
      }
    }
  }

  if (p.error) {
    lines.push('ОШИБКА');
    hr();
    lines.push(String(p.error));
    blank();
  }

  lines.push(hr(), '');
  lines.push(`Сгенерировано DiffSAT Algorithm v0.2b`);

  // Open print dialog with monospace text
  const text = lines.join('\n');
  const win = window.open('', '_blank');
  if (!win) {
    // Fallback: download as .txt
    downloadFile(text, `experiment_${data.id}.txt`, 'text/plain');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html><head>
<title>DiffSAT — Эксперимент ${data.id}</title>
<style>
  @page { margin: 15mm; }
  body { font-family: 'Consolas', 'Courier New', monospace; font-size: 11px;
         line-height: 1.5; white-space: pre-wrap; word-break: break-all;
         color: #1e1e1e; background: #fff; }
</style>
</head><body>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</body></html>`);
  win.document.close();
  win.print();
}

interface ExportButtonsProps {
  data: ExportData;
  compact?: boolean;
}

export default function ExportButtons({ data, compact }: ExportButtonsProps) {
  const [open, setOpen] = useState(false);

  if (compact) {
    return (
      <div className="relative inline-block">
        <button
          onClick={() => setOpen(!open)}
          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
        >
          Экспорт
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-20 py-1 min-w-[140px]">
              <button
                onClick={() => { exportJSON(data); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >
                JSON-файл
              </button>
              <button
                onClick={() => { exportPDF(data); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >
                PDF (печать)
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => exportJSON(data)}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
      >
        Экспорт JSON
      </button>
      <button
        onClick={() => exportPDF(data)}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
      >
        Экспорт PDF
      </button>
    </div>
  );
}
