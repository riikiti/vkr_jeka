import { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import InfoModal from '../components/InfoModal';
import MessageDisplay from '../components/MessageDisplay';
import ExportButtons from '../components/ExportButtons';
import { batchGrid, batchDiffs, batchProgress } from '../data/infoContent';

const API = '/api/experiments';

interface BatchStatus {
  id: string;
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  status: string;
  created_at: number;
  completed_at: number | null;
  max_workers: number;
  summary?: { success_count: number; avg_time: number; best_time: number };
}

interface SolverStats {
  result: string;
  solve_time: number;
  num_conflicts: number;
  num_decisions: number;
  num_propagations: number;
  num_restarts: number;
  num_learnt_clauses: number;
}

interface AttemptInfo {
  diff: string[];
  result: string;
  solve_time: number;
  encoding_time: number;
  hamming_weight: number;
  num_vars?: number;
  num_clauses?: number;
  num_conflicts?: number;
  num_decisions?: number;
  num_propagations?: number;
  num_restarts?: number;
  num_learnt_clauses?: number;
}

interface ExperimentResults {
  success: boolean;
  total_time: number;
  characteristics_tried: number;
  encoding_time?: number;
  solving_time?: number;
  m1_words?: string[] | null;
  m2_words?: string[] | null;
  hash1?: string;
  hash2?: string;
  hashes_match?: boolean;
  xor_diff?: string[] | null;
  diff_hamming_weight?: number;
  solver_stats?: SolverStats | null;
  attempts?: AttemptInfo[] | null;
}

interface ProgressInfo {
  stage?: string;
  attempt?: number;
  total?: number;
  message?: string;
}

interface BatchExperiment {
  id: string;
  batch_id?: string;
  config: {
    num_rounds: number;
    solver: string;
    timeout: number;
    hash_function: string;
    max_characteristics: number;
  };
  status: string;
  results?: ExperimentResults | null;
  progress?: ProgressInfo;
  error?: string;
}

async function startBatch(payload: object): Promise<BatchStatus> {
  const r = await fetch(`${API}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchBatch(id: string): Promise<BatchStatus> {
  const r = await fetch(`${API}/batch/${id}`);
  if (!r.ok) throw new Error('fetch failed');
  return r.json();
}

async function fetchBatchExperiments(id: string): Promise<BatchExperiment[]> {
  const r = await fetch(`${API}/batch/${id}/experiments`);
  if (!r.ok) throw new Error('fetch failed');
  return r.json();
}

function parseInts(s: string): number[] {
  return s.split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n) && n > 0);
}
function parseStrings(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

const SOLVERS = ['cadical153', 'glucose4', 'minisat22'];
const HASH_FUNCTIONS: Record<string, { label: string; maxRounds: number }> = {
  sha256: { label: 'SHA-256', maxRounds: 64 },
  md5: { label: 'MD5', maxRounds: 64 },
  md4: { label: 'MD4', maxRounds: 48 },
};

const DIFF_PRESETS: Record<string, { label: string; desc: string; diffs: string[][] | null }> = {
  auto: {
    label: 'Автоподбор',
    desc: 'Автоматическая генерация: сначала однобитные MSB в каждом слове, потом LSB, потом случайные. Количество = поле «Попыток на эксперимент».',
    diffs: null,
  },
  two_bit: {
    label: '2 бита',
    desc: 'Два старших бита в W[0] — больше переносов',
    diffs: [
      ['c0000000', ...Array(15).fill('00000000')],
      ['80000000', '80000000', ...Array(14).fill('00000000')],
    ],
  },
  multi_word: {
    label: 'Многословная',
    desc: 'Разности в нескольких словах — сложнее для решателя',
    diffs: [
      ['80000000', '00000000', '00000000', '00000000', '80000000', ...Array(11).fill('00000000')],
      ['80000000', '00000000', '00000000', '00000000', '00000000', '00000000', '00000000', '00000000', '80000000', ...Array(7).fill('00000000')],
    ],
  },
  heavy: {
    label: 'Тяжёлая (8 бит)',
    desc: 'FF в старшем байте — высокий вес, сложная задача',
    diffs: [
      ['ff000000', ...Array(15).fill('00000000')],
    ],
  },
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  running: 'bg-cyan-500/20 text-cyan-400',
  pending: 'bg-slate-600/40 text-slate-400',
};

const ATTEMPT_RESULT_STYLE: Record<string, string> = {
  SAT: 'bg-green-500/20 text-green-400',
  SATISFIABLE: 'bg-green-500/20 text-green-400',
  UNSAT: 'bg-red-500/20 text-red-400',
  UNSATISFIABLE: 'bg-red-500/20 text-red-400',
  TIMEOUT: 'bg-yellow-500/20 text-yellow-400',
  CANCELLED: 'bg-purple-500/20 text-purple-400',
};
const ATTEMPT_RESULT_LABEL: Record<string, string> = {
  SAT: 'SAT (найдено)',
  SATISFIABLE: 'SAT (найдено)',
  UNSAT: 'UNSAT (невозможно)',
  UNSATISFIABLE: 'UNSAT (невозможно)',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'ОТМЕНЕНО',
};

function AttemptsLog({ attempts }: { attempts?: AttemptInfo[] | null }) {
  if (!attempts || attempts.length === 0) return null;
  return (
    <div>
      <p className="text-slate-400 mb-1 font-semibold">Лог попыток ({attempts.length})</p>
      <div className="space-y-2">
        {attempts.map((a, i) => {
          const activeWords = a.diff
            .map((w, idx) => ({ w, idx }))
            .filter(x => x.w !== '0x00000000');
          const hasStats = !!(a.num_vars || a.num_conflicts || a.num_decisions);
          return (
            <div key={i} className="bg-slate-950 rounded-lg p-2.5 border border-slate-800">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 font-mono text-xs">#{i + 1}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ATTEMPT_RESULT_STYLE[a.result] ?? 'text-slate-400'}`}>
                  {ATTEMPT_RESULT_LABEL[a.result] ?? a.result}
                </span>
                <span className="text-xs text-slate-500">
                  <span className="text-slate-300 font-mono">{a.solve_time.toFixed(2)}с</span>
                </span>
                <span className="text-xs text-slate-600">HW={a.hamming_weight}</span>
                {activeWords.length > 0 && (
                  <span className="text-xs font-mono text-yellow-400/70">
                    {activeWords.map(x => `W[${x.idx}]`).join(', ')}
                  </span>
                )}
              </div>
              {/* Expandable details */}
              {hasStats && (
                <details className="mt-1.5">
                  <summary className="text-[11px] text-blue-400 cursor-pointer hover:text-blue-300 select-none">
                    Расширенная информация (SAT-решатель)
                  </summary>
                  <div className="mt-1.5 space-y-1.5 text-[11px]">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      <div><span className="text-slate-500">Перем.:</span> <span className="text-slate-300 font-mono">{(a.num_vars ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Дизъюнкт.:</span> <span className="text-slate-300 font-mono">{(a.num_clauses ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Конфликты:</span> <span className="text-yellow-300 font-mono">{(a.num_conflicts ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Решения:</span> <span className="text-slate-300 font-mono">{(a.num_decisions ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Распр-ия:</span> <span className="text-slate-300 font-mono">{(a.num_propagations ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Рестарты:</span> <span className="text-slate-300 font-mono">{(a.num_restarts ?? 0).toLocaleString()}</span></div>
                    </div>
                    <div className={`rounded p-2 ${
                      a.result === 'SATISFIABLE' ? 'bg-green-500/10 border border-green-500/20' :
                      a.result === 'UNSATISFIABLE' ? 'bg-red-500/10 border border-red-500/20' :
                      a.result === 'TIMEOUT' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                      'bg-slate-800 border border-slate-700'
                    }`}>
                      {a.result === 'SATISFIABLE' && (
                        <p className="text-green-400/80">Найден набор значений {(a.num_vars ?? 0).toLocaleString()} переменных, удовлетворяющий всем дизъюнктам → коллизия существует.</p>
                      )}
                      {a.result === 'UNSATISFIABLE' && (
                        <p className="text-red-400/80">Через {(a.num_conflicts ?? 0).toLocaleString()} конфликтов выведен пустой дизъюнкт (⊥) — формальное доказательство, что коллизия с данной ΔM невозможна.</p>
                      )}
                      {a.result === 'TIMEOUT' && (
                        <p className="text-yellow-400/80">За отведённое время обработано {(a.num_conflicts ?? 0).toLocaleString()} конфликтов, но результат не определён.</p>
                      )}
                      {a.result === 'CANCELLED' && (
                        <p className="text-purple-400/80">Прервано. Обработано {(a.num_conflicts ?? 0).toLocaleString()} конфликтов.</p>
                      )}
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CollisionDetails({ results, hashFunction }: { results: ExperimentResults; hashFunction?: string }) {
  const { m1_words, m2_words, hash1, hash2, hashes_match, xor_diff, diff_hamming_weight,
          encoding_time, solving_time, solver_stats } = results;

  return (
    <div className="space-y-3 text-xs">
      {/* Messages */}
      {m1_words && m2_words && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MessageDisplay
            words={m1_words}
            label="Сообщение M1 (16 слов)"
            color="text-green-400"
            hashFunction={hashFunction}
          />
          <MessageDisplay
            words={m2_words}
            label="Сообщение M2 (отличающиеся байты выделены)"
            color="text-cyan-400"
            diffWords={m1_words}
            hashFunction={hashFunction}
          />
        </div>
      )}

      {/* XOR difference */}
      {xor_diff && (
        <div>
          <p className="text-slate-400 mb-1 font-semibold">
            XOR-разность (M1 ^ M2)
            {diff_hamming_weight != null && (
              <span className="text-yellow-400 ml-2">вес Хэмминга: {diff_hamming_weight}</span>
            )}
          </p>
          <div className="bg-slate-950 rounded-lg p-2 font-mono text-yellow-400 break-all leading-relaxed">
            {xor_diff.map((w, i) => {
              const isActive = w !== '0x00000000';
              return (
                <span key={i} className={isActive ? 'text-yellow-400' : 'text-slate-600'}>
                  {w}
                  {i < xor_diff.length - 1 && <span className="text-slate-700"> </span>}
                  {(i + 1) % 4 === 0 && i < xor_diff.length - 1 && <br />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Hashes */}
      {hash1 && hash2 && (
        <div>
          <p className="text-slate-400 mb-1 font-semibold">
            Хэши ({(hashFunction || 'sha256').toUpperCase().replace('SHA256','SHA-256')} reduced)
            {hashes_match != null && (
              <span className={`ml-2 ${hashes_match ? 'text-green-400' : 'text-red-400'}`}>
                {hashes_match ? 'совпадают' : 'НЕ совпадают'}
              </span>
            )}
          </p>
          <div className="bg-slate-950 rounded-lg p-2 font-mono space-y-1">
            <div>
              <span className="text-slate-500">H(M1) = </span>
              <span className="text-purple-400 break-all">{hash1}</span>
            </div>
            <div>
              <span className="text-slate-500">H(M2) = </span>
              <span className="text-purple-400 break-all">{hash2}</span>
            </div>
          </div>
        </div>
      )}

      {/* Timing breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
          <p className="text-slate-500">Общее время</p>
          <p className="text-white font-mono font-semibold">{results.total_time.toFixed(3)}с</p>
        </div>
        {encoding_time != null && (
          <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
            <p className="text-slate-500">Кодирование</p>
            <p className="text-white font-mono font-semibold">{encoding_time.toFixed(3)}с</p>
          </div>
        )}
        {solving_time != null && (
          <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
            <p className="text-slate-500">SAT-решение</p>
            <p className="text-white font-mono font-semibold">{solving_time.toFixed(3)}с</p>
          </div>
        )}
        <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
          <p className="text-slate-500">Характеристик</p>
          <p className="text-white font-mono font-semibold">{results.characteristics_tried}</p>
        </div>
      </div>

      {/* Solver stats */}
      {solver_stats && (
        <div>
          <p className="text-slate-400 mb-1 font-semibold">Статистика решателя</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: 'Результат', value: solver_stats.result },
              { label: 'Конфликты', value: solver_stats.num_conflicts.toLocaleString() },
              { label: 'Решения', value: solver_stats.num_decisions.toLocaleString() },
              { label: 'Пропагации', value: solver_stats.num_propagations.toLocaleString() },
              { label: 'Рестарты', value: solver_stats.num_restarts.toLocaleString() },
              { label: 'Выученных дизъюнктов', value: solver_stats.num_learnt_clauses.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                <p className="text-slate-500 truncate">{label}</p>
                <p className="text-white font-mono text-xs">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attempts log */}
      <AttemptsLog attempts={results.attempts} />
    </div>
  );
}

export default function BatchPage() {
  // Grid config
  const [numRounds, setNumRounds] = useState('4,6,8,10');
  const [solvers, setSolvers] = useState('cadical153,glucose4');
  const [timeouts, setTimeouts] = useState('60');
  const [maxChars, setMaxChars] = useState('5,10');
  const [hashFunctions, setHashFunctions] = useState('sha256');
  const [methods, setMethods] = useState('combined');
  const [strategies, setStrategies] = useState('sequential');
  const [maxWorkers, setMaxWorkers] = useState(4);
  const [sampleSize, setSampleSize] = useState('');
  const [diffPreset, setDiffPreset] = useState('auto');
  const [customDiffText, setCustomDiffText] = useState('');
  const [showCustomDiff, setShowCustomDiff] = useState(false);

  const hashFuncList = parseStrings(hashFunctions);

  // Batch state
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [experiments, setExperiments] = useState<BatchExperiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On mount: restore the most recent non-completed batch (or the latest completed one)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/batches/list`);
        if (!r.ok) return;
        const batches: BatchStatus[] = await r.json();
        if (batches.length === 0) return;

        // Prefer a running batch; otherwise take the most recent by created_at
        const running = batches.find(b => b.status !== 'completed');
        const latest = running ?? batches.sort((a, b) => b.created_at - a.created_at)[0];
        if (latest) {
          setBatchId(latest.id);
          setBatch(latest);
        }
      } catch { /* backend not available yet — ignore */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse active message diffs
  const getMessageDiffs = (): string[][] | null => {
    if (diffPreset === 'custom') {
      const lines = customDiffText.split('\n').filter(l => l.trim());
      if (lines.length === 0) return null;
      return lines.map(line => {
        const words = line.trim().split(/[\s,]+/).map(w => w.replace(/^0x/i, '').padStart(8, '0'));
        while (words.length < 16) words.push('00000000');
        return words.slice(0, 16);
      });
    }
    if (diffPreset === 'auto') return null; // backend auto-generates
    return DIFF_PRESETS[diffPreset]?.diffs ?? null;
  };

  const activeDiffs = getMessageDiffs();
  const isAutoMode = diffPreset === 'auto';

  const roundsList = parseInts(numRounds);
  const solversList = parseStrings(solvers);
  const timeoutsList = parseInts(timeouts);
  const maxCharsList = parseInts(maxChars);
  const methodsList = parseStrings(methods);
  const strategiesList = parseStrings(strategies);
  const totalCombos = roundsList.length * solversList.length * timeoutsList.length
    * maxCharsList.length * hashFuncList.length * methodsList.length * strategiesList.length;
  const effectiveCount = sampleSize
    ? Math.min(parseInt(sampleSize) || totalCombos, totalCombos)
    : totalCombos;

  // Polling
  useEffect(() => {
    if (!batchId) return;

    const poll = async () => {
      try {
        const [b, exps] = await Promise.all([
          fetchBatch(batchId),
          fetchBatchExperiments(batchId),
        ]);
        setBatch(b);
        setExperiments(exps);
        if (b.status === 'completed') {
          clearInterval(pollRef.current!);
        }
      } catch {
        clearInterval(pollRef.current!);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current!);
  }, [batchId]);

  const handleStart = async () => {
    if (roundsList.length === 0 || solversList.length === 0 || timeoutsList.length === 0 || maxCharsList.length === 0) {
      alert('Проверьте корректность параметров — все поля должны содержать хотя бы одно значение.');
      return;
    }
    setLoading(true);
    setBatch(null);
    setExperiments([]);
    setBatchId(null);
    setExpandedId(null);
    try {
      const payload = {
        param_grid: {
          num_rounds: roundsList,
          solver: solversList,
          timeout: timeoutsList,
          hash_function: hashFuncList,
          max_characteristics: maxCharsList,
          method: methodsList,
          combined_strategy: strategiesList,
          message_diffs: activeDiffs,
        },
        max_workers: maxWorkers,
        sample_size: sampleSize ? parseInt(sampleSize) : null,
      };
      const result = await startBatch(payload);
      setBatchId(result.id);
      setBatch(result);
    } catch (e: unknown) {
      alert('Ошибка: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const progress = batch ? Math.round(((batch.completed + batch.failed) / batch.total) * 100) : 0;
  const elapsed = batch
    ? batch.completed_at
      ? batch.completed_at - batch.created_at
      : Date.now() / 1000 - batch.created_at
    : 0;

  const filteredExps = filterStatus === 'all'
    ? experiments
    : experiments.filter(e => e.status === filterStatus);

  // Chart data: success rate by num_rounds
  const byRounds: Record<number, { total: number; success: number }> = {};
  for (const exp of experiments) {
    const r = exp.config.num_rounds;
    if (!byRounds[r]) byRounds[r] = { total: 0, success: 0 };
    byRounds[r].total++;
    if (exp.results?.success) byRounds[r].success++;
  }
  const chartData = Object.entries(byRounds)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([rounds, d]) => ({
      rounds: `${rounds}r`,
      success: d.success,
      failed: d.total - d.success,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Массовые эксперименты</h1>
        <p className="text-sm text-slate-400 mt-1">
          Автоматический перебор параметров (grid search) с параллельным выполнением
        </p>
      </div>

      {/* Config */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Сетка параметров
          </h2>
          <InfoModal title={batchGrid.title}>{batchGrid.content}</InfoModal>
        </div>
        <p className="text-xs text-slate-500">
          Вводите значения через запятую. Будет создан полный перебор всех комбинаций.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate" title={`Хэш-функция (${hashFuncList.length})`}>
              Хэш-функция
            </label>
            <input
              value={hashFunctions}
              onChange={e => setHashFunctions(e.target.value)}
              placeholder="sha256,md5,md4"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Допустимые: <span className="text-slate-400">sha256</span>, <span className="text-slate-400">md5</span>, <span className="text-slate-400">md4</span></p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate" title={`Раунды (${roundsList.length} значений)`}>
              Раунды
            </label>
            <input
              value={numRounds}
              onChange={e => setNumRounds(e.target.value)}
              placeholder="4,6,8,10,12"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Целые числа. SHA-256: 1–64, MD5: 1–64, MD4: 1–48</p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate" title={`SAT-решатели (${solversList.length})`}>
              SAT-решатели
            </label>
            <input
              value={solvers}
              onChange={e => setSolvers(e.target.value)}
              placeholder="cadical153,glucose4,minisat22"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Допустимые: <span className="text-slate-400">cadical153</span>, <span className="text-slate-400">glucose4</span>, <span className="text-slate-400">minisat22</span></p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate" title={`Таймауты (${timeoutsList.length})`}>
              Таймауты, с
            </label>
            <input
              value={timeouts}
              onChange={e => setTimeouts(e.target.value)}
              placeholder="30,60,120"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Секунды на одну попытку. Рекомендация: 30–120</p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate" title={`Попыток (${maxCharsList.length})`}>
              Попыток на эксперимент
            </label>
            <input
              value={maxChars}
              onChange={e => setMaxChars(e.target.value)}
              placeholder="5,10,20"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Кол-во разностей ΔM для перебора. Больше = дольше</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate">Метод</label>
            <input
              value={methods}
              onChange={e => setMethods(e.target.value)}
              placeholder="combined"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Допустимые: <span className="text-slate-400">combined</span>, <span className="text-slate-400">pure_sat</span>, <span className="text-slate-400">pure_differential</span></p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate">Стратегия</label>
            <input
              value={strategies}
              onChange={e => setStrategies(e.target.value)}
              placeholder="sequential"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Допустимые: <span className="text-slate-400">sequential</span>, <span className="text-slate-400">iterative</span>, <span className="text-slate-400">hybrid</span></p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate">Параллельных воркеров</label>
            <input
              type="number" min={1} max={32} value={maxWorkers}
              onChange={e => setMaxWorkers(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">1–32. Больше = быстрее, но больше нагрузка на CPU</p>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-slate-400 mb-1 truncate" title="Случайная выборка (пусто = все)">
              Выборка из комбинаций
            </label>
            <input
              type="number" min={1} value={sampleSize}
              onChange={e => setSampleSize(e.target.value)}
              placeholder={`все ${totalCombos}`}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Пусто = все комбинации. Число = случайная выборка</p>
          </div>
        </div>

        {/* Message difference selector */}
        <div className="space-y-2 pt-1 border-t border-slate-700">
          <div className="flex items-center gap-2 pt-2">
            <label className="text-xs text-slate-400 font-semibold">Разность сообщений</label>
            <InfoModal title={batchDiffs.title} size="md">{batchDiffs.content}</InfoModal>
            {!isAutoMode && activeDiffs && (
              <span className="text-xs text-slate-600">({activeDiffs.length} фиксированных)</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(DIFF_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => { setDiffPreset(key); setShowCustomDiff(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                  diffPreset === key
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => { setDiffPreset('custom'); setShowCustomDiff(true); }}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                diffPreset === 'custom'
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
              }`}
            >
              Своя разность
            </button>
          </div>

          {/* Preset description */}
          {diffPreset !== 'custom' && DIFF_PRESETS[diffPreset] && (
            <div className="text-xs text-slate-500">
              {DIFF_PRESETS[diffPreset].desc}
              {DIFF_PRESETS[diffPreset].diffs && (
                <div className="mt-1 font-mono text-slate-600 space-y-0.5">
                  {DIFF_PRESETS[diffPreset].diffs!.map((diff, i) => (
                    <div key={i}>
                      <span className="text-slate-500">#{i + 1}: </span>
                      {diff.map((w, j) => {
                        const isActive = w !== '00000000';
                        return (
                          <span key={j} className={isActive ? 'text-yellow-500' : 'text-slate-700'}>
                            {w}{j < 15 ? ' ' : ''}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Custom diff input */}
          {showCustomDiff && (
            <div>
              <p className="text-xs text-slate-500 mb-1">
                Каждая строка — одна разность (16 hex-слов через пробел). Можно указать меньше 16 — остальные дополнятся нулями.
              </p>
              <textarea
                value={customDiffText}
                onChange={e => setCustomDiffText(e.target.value)}
                placeholder={"80000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000\nc0000000"}
                rows={3}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs font-mono
                           focus:border-cyan-500 outline-none resize-y"
              />
              {activeDiffs && activeDiffs.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Распознано {activeDiffs.length} разностей,
                  вес Хэмминга: {activeDiffs.map(d =>
                    d.reduce((sum, w) => {
                      let n = parseInt(w, 16);
                      let c = 0;
                      while (n) { c += n & 1; n >>>= 1; }
                      return sum + c;
                    }, 0)
                  ).join(', ')} бит
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={handleStart}
            disabled={loading}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold
                       disabled:opacity-50 transition-colors"
          >
            {loading ? 'Запуск...' : `Запустить ${effectiveCount} экспериментов`}
          </button>
          <div className="text-sm text-slate-400">
            <span className="text-white font-mono">{totalCombos}</span> комбинаций
            {' '}&times;{' '}
            <span className="text-white font-mono">{maxWorkers}</span> параллельно
          </div>
        </div>
      </div>

      {/* Progress panel */}
      {batch && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Батч</h2>
              <InfoModal title={batchProgress.title}>{batchProgress.content}</InfoModal>
              <code className="text-slate-400 text-sm bg-slate-900 px-2 py-0.5 rounded">
                {batch.id}
              </code>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                batch.status === 'completed'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-cyan-500/20 text-cyan-400 animate-pulse'
              }`}>
                {batch.status === 'completed' ? 'завершён' : 'выполняется...'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {batch.status !== 'completed' && (
                <button
                  onClick={async () => {
                    try {
                      await fetch(`${API}/batch/${batch.id}/cancel`, { method: 'POST' });
                    } catch {}
                  }}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Остановить
                </button>
              )}
              <span className="text-slate-500 text-sm">
                {elapsed < 60
                  ? `${elapsed.toFixed(0)}с`
                  : `${(elapsed / 60).toFixed(1)}мин`}
              </span>
            </div>
          </div>

          {/* Live running experiments info */}
          {batch.running > 0 && (() => {
            const runningExps = experiments.filter(e => e.status === 'running' && e.progress?.message);
            if (runningExps.length === 0) return null;
            return (
              <div className="bg-slate-900/50 rounded-lg p-3 border border-cyan-500/20 space-y-1.5">
                <p className="text-xs text-cyan-400 font-semibold">Сейчас выполняется ({batch.running}):</p>
                {runningExps.slice(0, 5).map(exp => (
                  <div key={exp.id} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span className="text-slate-500 font-mono shrink-0">{exp.config.hash_function.toUpperCase().replace('SHA256','SHA-256')} {exp.config.num_rounds}r</span>
                    <span className="text-slate-400 truncate">{exp.progress?.message}</span>
                    {exp.progress?.attempt != null && exp.progress?.total != null && (
                      <span className="text-slate-600 font-mono shrink-0">[{exp.progress.attempt}/{exp.progress.total}]</span>
                    )}
                  </div>
                ))}
                {runningExps.length > 5 && (
                  <p className="text-[10px] text-slate-600">...и ещё {runningExps.length - 5}</p>
                )}
              </div>
            );
          })()}

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{batch.completed + batch.failed} / {batch.total}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: batch.failed > 0
                    ? `linear-gradient(90deg, #22d3ee ${((batch.completed / (batch.completed + batch.failed)) * 100).toFixed(0)}%, #f87171 100%)`
                    : '#22d3ee',
                }}
              />
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Всего', value: batch.total, color: 'text-white' },
              { label: 'В очереди', value: batch.pending, color: 'text-slate-400' },
              { label: 'Выполняется', value: batch.running, color: 'text-cyan-400' },
              { label: 'Готово', value: batch.completed, color: 'text-green-400' },
              { label: 'Ошибок', value: batch.failed, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Summary */}
          {batch.summary && batch.completed > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-500/30">
                <p className="text-xs text-slate-400">Коллизий найдено</p>
                <p className="text-2xl font-bold text-purple-400 font-mono">{batch.summary.success_count}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <p className="text-xs text-slate-400">Среднее время</p>
                <p className="text-2xl font-bold text-white font-mono">{batch.summary.avg_time}с</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <p className="text-xs text-slate-400">Лучшее время</p>
                <p className="text-2xl font-bold text-cyan-400 font-mono">{batch.summary.best_time}с</p>
              </div>
            </div>
          )}

          {/* Chart: success by rounds */}
          {chartData.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
              <p className="text-sm font-semibold text-slate-300 mb-3">
                Результаты по количеству раундов
              </p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <XAxis dataKey="rounds" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Bar dataKey="success" name="Коллизия найдена" stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="failed" name="Не найдена" stackId="a" fill="#475569" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Experiments table */}
          {experiments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Фильтр:</span>
                {['all', 'pending', 'running', 'completed', 'failed'].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      filterStatus === s
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {s === 'all' ? `Все (${experiments.length})` : `${s} (${experiments.filter(e => e.status === s).length})`}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-slate-900">
                    <tr className="text-slate-400 text-xs">
                      <th className="text-left px-3 py-2">ID</th>
                      <th className="text-left px-3 py-2">Хэш</th>
                      <th className="text-left px-3 py-2">Раунды</th>
                      <th className="text-left px-3 py-2">Решатель</th>
                      <th className="text-left px-3 py-2">Таймаут</th>
                      <th className="text-left px-3 py-2">Хар-к</th>
                      <th className="text-left px-3 py-2">Статус</th>
                      <th className="text-left px-3 py-2">Коллизия</th>
                      <th className="text-left px-3 py-2">Время</th>
                      <th className="text-left px-3 py-2">Проверено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExps.map(exp => {
                      const r = exp.results;
                      const isExpanded = expandedId === exp.id;
                      const hasDetails = r != null && (r.success || r.solver_stats || (r.attempts && r.attempts.length > 0));
                      return (
                        <tr
                          key={exp.id}
                          className={`border-t border-slate-800 transition-colors ${
                            hasDetails ? 'cursor-pointer hover:bg-slate-700/50' : 'hover:bg-slate-750'
                          } ${isExpanded ? 'bg-slate-700/30' : ''}`}
                          onClick={() => hasDetails && setExpandedId(isExpanded ? null : exp.id)}
                        >
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{exp.id}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-300">{(exp.config.hash_function || 'sha256').toUpperCase().replace('SHA256','SHA-256')}</td>
                          <td className="px-3 py-1.5 font-mono">{exp.config.num_rounds}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{exp.config.solver.replace('153', '').replace('22', '')}</td>
                          <td className="px-3 py-1.5 text-slate-300">{exp.config.timeout}с</td>
                          <td className="px-3 py-1.5 text-slate-300">{exp.config.max_characteristics}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[exp.status] ?? 'text-slate-400'}`}>
                              {exp.status}
                            </span>
                            {exp.status === 'running' && exp.progress?.message && (
                              <span className="block text-[10px] text-cyan-400/70 mt-0.5 truncate max-w-[200px]" title={exp.progress.message}>
                                {exp.progress.message}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {r != null ? (
                              <span className={r.success ? 'text-green-400 font-semibold' : 'text-slate-500'}>
                                {r.success ? 'ДА' : 'нет'}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-300 font-mono text-xs">
                            {r?.total_time != null ? `${r.total_time.toFixed(2)}с` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-400 text-xs">
                            {r?.characteristics_tried ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded detail panel (outside table for proper layout) */}
              {expandedId && (() => {
                const exp = experiments.find(e => e.id === expandedId);
                if (!exp?.results) return null;
                return (
                  <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        Детали эксперимента {exp.id}
                        <span className="text-slate-500 font-normal ml-2">
                          {exp.config.num_rounds} раундов / {exp.config.solver} / {exp.config.timeout}с
                        </span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <ExportButtons
                          compact
                          data={{
                            id: exp.id,
                            config: exp.config as unknown as Record<string, unknown>,
                            status: exp.status,
                            results: exp.results as Record<string, unknown> | null,
                            error: exp.error,
                          }}
                        />
                        <button
                          onClick={() => setExpandedId(null)}
                          className="text-slate-500 hover:text-white text-xs"
                        >
                          Свернуть
                        </button>
                      </div>
                    </div>

                    {exp.results.success ? (
                      <CollisionDetails results={exp.results} hashFunction={exp.config.hash_function} />
                    ) : (
                      <div className="text-xs space-y-2">
                        <p className="text-slate-400">
                          Коллизия не найдена. Проверено характеристик: {exp.results.characteristics_tried}.
                        </p>
                        {/* Timing */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                            <p className="text-slate-500">Общее время</p>
                            <p className="text-white font-mono font-semibold">{exp.results.total_time.toFixed(3)}с</p>
                          </div>
                          {exp.results.encoding_time != null && (
                            <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                              <p className="text-slate-500">Кодирование</p>
                              <p className="text-white font-mono font-semibold">{exp.results.encoding_time.toFixed(3)}с</p>
                            </div>
                          )}
                          {exp.results.solving_time != null && (
                            <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                              <p className="text-slate-500">SAT-решение</p>
                              <p className="text-white font-mono font-semibold">{exp.results.solving_time.toFixed(3)}с</p>
                            </div>
                          )}
                        </div>
                        <AttemptsLog attempts={exp.results.attempts} />
                        {exp.error && (
                          <p className="text-red-400 font-mono">{exp.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
