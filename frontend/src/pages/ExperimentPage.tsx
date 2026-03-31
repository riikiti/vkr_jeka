import { useState, useEffect, useRef } from 'react';
import { runExperiment, getExperiment, listExperiments } from '../api/experiments';
import type { ExperimentResult } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import InfoModal from '../components/InfoModal';
import MessageDisplay from '../components/MessageDisplay';
import ExportButtons from '../components/ExportButtons';
import { expConfig, expResults } from '../data/infoContent';

const SOLVER_COLORS = ['#06b6d4', '#a78bfa', '#34d399', '#fb923c'];
const TIME_COLORS = ['#06b6d4', '#475569'];

const HASH_INFO: Record<string, { label: string; maxRounds: number }> = {
  sha256: { label: 'SHA-256', maxRounds: 64 },
  md5:    { label: 'MD5',     maxRounds: 64 },
  md4:    { label: 'MD4',     maxRounds: 48 },
};

const SOLVER_LABELS: Record<string, string> = {
  cadical153: 'CaDiCaL 1.5.3',
  glucose4: 'Glucose 4',
  minisat22: 'MiniSAT 2.2',
};

const STRATEGY_LABELS: Record<string, string> = {
  sequential: 'Последовательная',
  iterative: 'Итеративная (с мутациями)',
  hybrid: 'Гибридная (Монте-Карло + SAT)',
};

const METHOD_LABELS: Record<string, string> = {
  combined: 'Комбинированный (Дифф + SAT)',
  pure_sat: 'Чистый SAT',
  pure_differential: 'Чистый дифференциальный',
};

const RESULT_STYLE: Record<string, string> = {
  SATISFIABLE: 'bg-green-500/20 text-green-400',
  UNSATISFIABLE: 'bg-red-500/20 text-red-400',
  TIMEOUT: 'bg-yellow-500/20 text-yellow-400',
  CANCELLED: 'bg-purple-500/20 text-purple-400',
  SAT: 'bg-green-500/20 text-green-400',
  UNSAT: 'bg-red-500/20 text-red-400',
};

const RESULT_LABEL: Record<string, string> = {
  SATISFIABLE: 'SAT — коллизия найдена',
  UNSATISFIABLE: 'UNSAT — доказано: невозможно',
  TIMEOUT: 'TIMEOUT — не успел решить',
  CANCELLED: 'ОТМЕНЕНО — прервано пользователем',
  SAT: 'SAT — коллизия найдена',
  UNSAT: 'UNSAT — доказано: невозможно',
};

const RESULT_EXPLANATION: Record<string, string> = {
  SATISFIABLE: 'Решатель нашёл такие значения M1 и M2, что хэши совпадают при данной разности.',
  UNSATISFIABLE: 'Решатель математически доказал, что для данной разности коллизия невозможна при данном числе раундов.',
  TIMEOUT: 'Решатель не смог ни найти коллизию, ни доказать её невозможность за отведённое время.',
  CANCELLED: 'Решение было прервано пользователем до завершения.',
  SAT: 'Решатель нашёл такие значения M1 и M2, что хэши совпадают при данной разности.',
  UNSAT: 'Решатель математически доказал, что для данной разности коллизия невозможна при данном числе раундов.',
};

export default function ExperimentPage() {
  const [hashFunc, setHashFunc] = useState('sha256');
  const [rounds, setRounds] = useState(8);
  const [method, setMethod] = useState('combined');
  const [strategy, setStrategy] = useState('sequential');
  const [solver, setSolver] = useState('cadical153');
  const [timeout, setTimeout_] = useState(300);
  const [maxChars, setMaxChars] = useState(10);
  const [seed, setSeed] = useState(42);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Load config (and optionally results) from an exported JSON file. */
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const cfg = data.config;
        if (!cfg) { alert('Файл не содержит config'); return; }

        // Apply config to form fields
        if (cfg.hash_function) setHashFunc(cfg.hash_function);
        if (cfg.num_rounds) setRounds(cfg.num_rounds);
        if (cfg.method) setMethod(cfg.method);
        if (cfg.combined_strategy) setStrategy(cfg.combined_strategy);
        if (cfg.solver) setSolver(cfg.solver);
        if (cfg.timeout) setTimeout_(cfg.timeout);
        if (cfg.max_characteristics) setMaxChars(cfg.max_characteristics);
        if (cfg.seed != null) setSeed(cfg.seed);

        // If file has results, show them too
        if (data.results && data.id) {
          setResult({
            id: data.id,
            config: cfg,
            status: data.status ?? 'completed',
            started_at: 0,
            results: data.results,
            error: data.error ?? undefined,
          } as ExperimentResult);
        }
      } catch {
        alert('Ошибка чтения JSON-файла');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  // On mount: restore the most recent experiment (running or last completed)
  useEffect(() => {
    (async () => {
      try {
        const all = await listExperiments();
        // Only non-batch experiments
        const single = all.filter(e => !(e as Record<string, unknown>).batch_id);
        if (single.length === 0) return;
        const running = single.find(e => e.status === 'pending' || e.status === 'running');
        const latest = running ?? single.sort((a, b) => {
          const ta = (a as unknown as Record<string, number>).started_at ?? 0;
          const tb = (b as unknown as Record<string, number>).started_at ?? 0;
          return tb - ta;
        })[0];
        if (latest) {
          setResult(latest);
          if (latest.status === 'pending' || latest.status === 'running') {
            setLoading(true);
          }
        }
      } catch { /* backend not ready */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll until experiment completes
  useEffect(() => {
    if (!result) return;
    if (result.status !== 'pending' && result.status !== 'running') return;

    pollRef.current = setInterval(async () => {
      try {
        const fresh = await getExperiment(result.id);
        setResult(fresh);
        if (fresh.status !== 'pending' && fresh.status !== 'running') {
          clearInterval(pollRef.current!);
          setLoading(false);
        }
      } catch {
        clearInterval(pollRef.current!);
        setLoading(false);
        setResult(null);
      }
    }, 1500);

    return () => clearInterval(pollRef.current!);
  }, [result?.id, result?.status]);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await runExperiment({
        hash_function: hashFunc,
        num_rounds: rounds,
        method,
        combined_strategy: strategy,
        solver,
        timeout,
        max_characteristics: maxChars,
        seed,
      });
      setResult(res);
      // If already done (shouldn't happen but guard anyway)
      if (res.status !== 'pending' && res.status !== 'running') {
        setLoading(false);
      }
    } catch (e: unknown) {
      alert('Ошибка: ' + (e as Error).message);
      setLoading(false);
    }
  };

  const results = result?.results as Record<string, unknown> | undefined;
  const solverStats = results?.solver_stats as Record<string, number> | undefined;

  const totalTime = (results?.total_time as number) ?? 0;
  const solvingTime = (results?.solving_time as number) ?? 0;
  const otherTime = Math.max(0, totalTime - solvingTime);

  const timeData = totalTime > 0
    ? [
        { name: 'SAT-решатель', value: parseFloat(solvingTime.toFixed(3)) },
        { name: 'Прочее', value: parseFloat(otherTime.toFixed(3)) },
      ].filter(d => d.value > 0)
    : [];

  const solverChartData = solverStats
    ? [
        { name: 'Конфликты', value: solverStats.num_conflicts ?? 0 },
        { name: 'Решения', value: solverStats.num_decisions ?? 0 },
        { name: 'Распр-ия', value: solverStats.num_propagations ?? 0 },
        { name: 'Рестарты', value: solverStats.num_restarts ?? 0 },
      ]
    : [];

  const configObj = result?.config as Record<string, unknown> | undefined;
  const configHashFunc = (configObj?.hash_function as string) ?? hashFunc;
  const configRounds = (configObj?.num_rounds as number) ?? rounds;
  const configMethod = (configObj?.method as string) ?? method;
  const configStrategy = (configObj?.combined_strategy as string) ?? strategy;
  const configSolver = (configObj?.solver as string) ?? solver;
  const configTimeout = (configObj?.timeout as number) ?? timeout;
  const configMaxChars = (configObj?.max_characteristics as number) ?? maxChars;
  const hashLabel = HASH_INFO[configHashFunc]?.label ?? configHashFunc.toUpperCase();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Запуск эксперимента</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Конфигурация</h2>
          <InfoModal title={expConfig.title} size="lg">{expConfig.content}</InfoModal>
        </div>
        {/* Строка 1: хэш-функция и раунды */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">Хэш-функция</label>
            <select
              value={hashFunc}
              onChange={e => {
                const v = e.target.value;
                setHashFunc(v);
                const max = HASH_INFO[v]?.maxRounds ?? 64;
                if (rounds > max) setRounds(max);
              }}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              {Object.entries(HASH_INFO).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">Раунды (1–{(HASH_INFO[hashFunc] ?? HASH_INFO.sha256).maxRounds})</label>
            <input
              type="number"
              min={1}
              max={(HASH_INFO[hashFunc] ?? HASH_INFO.sha256).maxRounds}
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">Метод</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="combined">Комбинированный (Дифф+SAT)</option>
              <option value="pure_sat">Чистый SAT</option>
              <option value="pure_differential">Чистый дифференциальный</option>
            </select>
          </div>
          {method === 'combined' && (
            <div className="min-w-0">
              <label className="block text-sm text-slate-400 mb-1 truncate">Стратегия</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="sequential">Последовательная</option>
                <option value="iterative">Итеративная</option>
                <option value="hybrid">Гибридная</option>
              </select>
            </div>
          )}
        </div>

        {/* Строка 2: параметры решателя */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">SAT-решатель</label>
            <select
              value={solver}
              onChange={e => setSolver(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="cadical153">CaDiCaL</option>
              <option value="glucose4">Glucose 4</option>
              <option value="minisat22">MiniSAT</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">Таймаут (с)</label>
            <input
              type="number"
              min={10}
              max={7200}
              value={timeout}
              onChange={e => setTimeout_(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">Макс. разностей</label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxChars}
              onChange={e => setMaxChars(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm text-slate-400 mb-1 truncate">Seed</label>
            <input
              type="number"
              value={seed}
              onChange={e => setSeed(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold
                       disabled:opacity-50 transition-colors text-lg"
          >
            {loading ? 'Выполнение...' : 'Запустить эксперимент'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJSON}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium
                       disabled:opacity-50 transition-colors text-sm"
          >
            Загрузить из JSON
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>SAT-решатель работает, это может занять некоторое время...</span>
            {result?.id && (
              <button
                onClick={async () => {
                  try {
                    await fetch(`/api/experiments/cancel/${result.id}`, { method: 'POST' });
                  } catch {}
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Остановить
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════  РЕЗУЛЬТАТЫ  ═══════════════════════ */}
      {result && (
        <div className="space-y-6">

          {/* ── Заголовок + статус ── */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-white">Отчёт об эксперименте</h2>
            <InfoModal title={expResults.title}>{expResults.content}</InfoModal>
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                result.status === 'completed'
                  ? 'bg-green-500/20 text-green-400'
                  : result.status === 'cancelled'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {result.status === 'completed' ? 'завершён' : result.status === 'cancelled' ? 'отменён' : result.status}
            </span>
            <span className="text-xs text-slate-500 font-mono">ID: {result.id}</span>
            {results && (
              <ExportButtons
                data={{
                  id: result.id,
                  config: (result.config ?? {}) as Record<string, unknown>,
                  status: result.status,
                  results: results as Record<string, unknown>,
                  error: result.error,
                }}
              />
            )}
          </div>

          {results && (
            <>
              {/* ── 1. Параметры эксперимента (recap) ── */}
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">1. Параметры эксперимента</h3>
                <p className="text-xs text-slate-500 mb-3">С какими настройками была запущена атака.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <ParamTag label="Хэш-функция" value={hashLabel} />
                  <ParamTag label="Раунды" value={`${configRounds} из ${HASH_INFO[configHashFunc]?.maxRounds ?? '?'}`} />
                  <ParamTag label="Метод" value={METHOD_LABELS[configMethod] ?? configMethod} />
                  {configMethod === 'combined' && (
                    <ParamTag label="Стратегия" value={STRATEGY_LABELS[configStrategy] ?? configStrategy} />
                  )}
                  <ParamTag label="SAT-решатель" value={SOLVER_LABELS[configSolver] ?? configSolver} />
                  <ParamTag label="Таймаут на попытку" value={`${configTimeout} с`} />
                  <ParamTag label="Макс. разностей" value={String(configMaxChars)} />
                </div>
              </div>

              {/* ── 2. Что делала система (пояснение) ── */}
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">2. Ход атаки</h3>
                <div className="text-xs text-slate-400 space-y-2">
                  <p>
                    Система искала <strong className="text-white">коллизию</strong> — два разных сообщения M1 и M2,
                    дающие одинаковый хэш: <span className="text-cyan-400 font-mono">H(M1) = H(M2)</span>.
                  </p>
                  <p>
                    Для этого перебирались <strong className="text-white">разности сообщений</strong> (ΔM).
                    Разность — это шаблон, определяющий, в каких битах M1 и M2 будут отличаться:
                    <span className="text-cyan-400 font-mono"> M2 = M1 ⊕ ΔM</span>.
                  </p>
                  <p>
                    Каждое сообщение — это <strong className="text-white">16 слов по 32 бита</strong> (512 бит).
                    Разность ΔM — тоже 16 слов. Слово, равное <span className="font-mono text-slate-500">0x00000000</span>,
                    означает «M1 и M2 совпадают в этом слове». Ненулевое слово (например, <span className="font-mono text-yellow-400">0x80000000</span>)
                    означает «в этих битах M1 и M2 различаются».
                  </p>
                  <p>
                    Для каждой разности система: (1) кодировала задачу в булеву формулу (CNF),
                    (2) запускала SAT-решатель, (3) анализировала результат.
                  </p>
                  <div className="mt-3 bg-slate-900 rounded-lg p-3 border border-slate-700">
                    <p className="text-slate-300 font-semibold mb-1">Возможные результаты для каждой разности:</p>
                    <ul className="space-y-1 list-none">
                      <li><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-2" />
                        <strong className="text-green-400">SAT</strong> — коллизия найдена! Решатель нашёл конкретные M1 и M2.</li>
                      <li><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-2" />
                        <strong className="text-red-400">UNSAT</strong> — доказано, что для этой разности и числа раундов коллизия невозможна.</li>
                      <li><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-2" />
                        <strong className="text-yellow-400">TIMEOUT</strong> — решатель не успел ни найти, ни опровергнуть за отведённое время.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* ── 3. Итог ── */}
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">3. Итог</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard
                    title="Коллизия найдена"
                    value={results.success ? 'ДА' : 'НЕТ'}
                    color={results.success ? 'text-green-400' : 'text-red-400'}
                  />
                  <MetricCard
                    title="Общее время"
                    value={`${totalTime.toFixed(2)} с`}
                  />
                  <MetricCard
                    title="Разностей проверено"
                    value={String(results.characteristics_tried ?? '-')}
                  />
                  <MetricCard
                    title="Время SAT-решателя"
                    value={`${solvingTime.toFixed(2)} с`}
                  />
                </div>
              </div>

              {/* ── 4. Подробный лог попыток ── */}
              {(() => {
                const attempts = results.attempts as {
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
                }[] | undefined;
                if (!attempts || attempts.length === 0) return null;

                const satCount = attempts.filter(a => a.result === 'SAT').length;
                const unsatCount = attempts.filter(a => a.result === 'UNSAT').length;
                const timeoutCount = attempts.filter(a => a.result === 'TIMEOUT').length;

                return (
                  <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 mb-1">4. Подробный лог попыток</h3>
                      <p className="text-xs text-slate-500">
                        Каждая строка — одна попытка решения с конкретной разностью сообщений ΔM.
                        {' '}Всего: {attempts.length} попыток
                        {satCount > 0 && <span className="text-green-400"> / {satCount} SAT</span>}
                        {unsatCount > 0 && <span className="text-red-400"> / {unsatCount} UNSAT</span>}
                        {timeoutCount > 0 && <span className="text-yellow-400"> / {timeoutCount} TIMEOUT</span>}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {attempts.map((a, i) => {
                        const activeWords = a.diff
                          .map((w, idx) => ({ hex: w, idx, isActive: w !== '0x00000000' }))
                          .filter(x => x.isActive);

                        return (
                          <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                            {/* Header row */}
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-slate-500 font-mono text-xs w-6">#{i + 1}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${RESULT_STYLE[a.result] ?? 'text-slate-400'}`}>
                                {RESULT_LABEL[a.result] ?? a.result}
                              </span>
                              <span className="text-xs text-slate-500">
                                решение: <span className="text-slate-300 font-mono">{a.solve_time.toFixed(2)} с</span>
                              </span>
                              <span className="text-xs text-slate-500">
                                кодирование: <span className="text-slate-300 font-mono">{a.encoding_time.toFixed(2)} с</span>
                              </span>
                            </div>

                            {/* Explanation of result */}
                            <p className="text-xs text-slate-500 mb-2 italic">
                              {RESULT_EXPLANATION[a.result] ?? ''}
                            </p>

                            {/* Difference visualization */}
                            <div className="text-xs">
                              <p className="text-slate-500 mb-1">
                                Разность ΔM (вес Хэмминга: <span className="text-yellow-400 font-mono">{a.hamming_weight}</span> бит):
                              </p>
                              {/* Compact: show full 16-word diff */}
                              <div className="bg-slate-950 rounded p-2 font-mono text-[11px] leading-relaxed break-all">
                                {a.diff.map((w, idx) => {
                                  const isActive = w !== '0x00000000';
                                  return (
                                    <span key={idx}>
                                      <span className="text-slate-600 text-[10px]">W{idx < 10 ? '\u00A0' : ''}{idx}=</span>
                                      <span className={isActive ? 'text-yellow-400 font-bold' : 'text-slate-600'}>
                                        {w}
                                      </span>
                                      {idx < 15 && <span className="text-slate-700"> </span>}
                                      {(idx + 1) % 4 === 0 && idx < 15 && <br />}
                                    </span>
                                  );
                                })}
                              </div>
                              {/* Human-readable summary */}
                              {activeWords.length > 0 && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Ненулевые слова ({activeWords.length} из 16):{' '}
                                  {activeWords.map((x, j) => (
                                    <span key={x.idx}>
                                      {j > 0 && ', '}
                                      <span className="text-yellow-400">
                                        слово #{x.idx}
                                      </span>
                                      {' '}= <span className="font-mono text-slate-300">{x.hex}</span>
                                    </span>
                                  ))}
                                  . Остальные слова — нулевые (M1 и M2 в них совпадают).
                                </p>
                              )}
                              {activeWords.length === 0 && (
                                <p className="text-xs text-slate-500 mt-1">Все слова нулевые — пустая разность.</p>
                              )}
                            </div>

                            {/* Expandable solver details */}
                            {(a.num_vars || a.num_conflicts || a.num_decisions) ? (
                              <details className="mt-2">
                                <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 select-none">
                                  Расширенная информация (SAT-решатель)
                                </summary>
                                <div className="mt-2 bg-slate-950 rounded p-3 text-xs space-y-2">
                                  {/* CNF formula stats */}
                                  <div>
                                    <p className="text-slate-400 font-semibold mb-1">CNF-формула:</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      <div><span className="text-slate-500">Переменных:</span> <span className="text-slate-200 font-mono">{(a.num_vars ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Дизъюнктов:</span> <span className="text-slate-200 font-mono">{(a.num_clauses ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Отношение C/V:</span> <span className="text-slate-200 font-mono">{a.num_vars ? (a.num_clauses! / a.num_vars).toFixed(2) : '—'}</span></div>
                                    </div>
                                  </div>
                                  {/* CDCL solver internals */}
                                  <div>
                                    <p className="text-slate-400 font-semibold mb-1">Работа CDCL-решателя:</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                      <div><span className="text-slate-500">Конфликты:</span> <span className="text-yellow-300 font-mono">{(a.num_conflicts ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Решения (decisions):</span> <span className="text-slate-200 font-mono">{(a.num_decisions ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Распространения:</span> <span className="text-slate-200 font-mono">{(a.num_propagations ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Рестарты:</span> <span className="text-slate-200 font-mono">{(a.num_restarts ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Выученные дизъюнкты:</span> <span className="text-slate-200 font-mono">{(a.num_learnt_clauses ?? 0).toLocaleString()}</span></div>
                                      <div><span className="text-slate-500">Конфликтов/с:</span> <span className="text-slate-200 font-mono">{a.solve_time > 0 ? Math.round((a.num_conflicts ?? 0) / a.solve_time).toLocaleString() : '—'}</span></div>
                                    </div>
                                  </div>
                                  {/* Explanation */}
                                  <div className="text-slate-500 leading-relaxed border-t border-slate-800 pt-2">
                                    {a.result === 'SATISFIABLE' && (
                                      <p>Решатель нашёл набор значений переменных, удовлетворяющий всем {(a.num_clauses ?? 0).toLocaleString()} дизъюнктам.
                                        В процессе поиска было принято {(a.num_decisions ?? 0).toLocaleString()} решений о значениях переменных,
                                        обнаружено {(a.num_conflicts ?? 0).toLocaleString()} конфликтов (каждый конфликт порождает новый выученный дизъюнкт),
                                        и выполнено {(a.num_restarts ?? 0).toLocaleString()} рестартов поиска.</p>
                                    )}
                                    {a.result === 'UNSATISFIABLE' && (
                                      <p>Решатель доказал, что формула невыполнима — коллизия с данной разностью ΔM математически невозможна.
                                        Доказательство потребовало {(a.num_conflicts ?? 0).toLocaleString()} конфликтов и {(a.num_decisions ?? 0).toLocaleString()} решений.
                                        {a.num_conflicts && a.num_conflicts < 500 ? ' Малое число конфликтов указывает на быстрое обнаружение противоречия.' : ''}</p>
                                    )}
                                    {a.result === 'TIMEOUT' && (
                                      <p>Решатель не смог ни найти решение, ни доказать невозможность за отведённое время.
                                        За это время было обработано {(a.num_conflicts ?? 0).toLocaleString()} конфликтов. Это может означать, что задача слишком сложна для данного числа раундов.</p>
                                    )}
                                    {a.result === 'CANCELLED' && (
                                      <p>Решение было прервано пользователем. За время работы было обработано {(a.num_conflicts ?? 0).toLocaleString()} конфликтов.</p>
                                    )}
                                  </div>
                                </div>
                              </details>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── 5. Графики ── */}
              {(timeData.length > 0 || solverChartData.length > 0) && (
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-1">5. Диаграммы</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Donut: разбивка времени */}
                    {timeData.length > 0 && (
                      <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                        <p className="text-xs font-semibold text-slate-400 mb-3">Разбивка времени выполнения</p>
                        <div className="h-52">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={timeData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                                label={({ name, value }) => `${name}: ${value}с`}
                                labelLine={false}
                              >
                                {timeData.map((_, i) => (
                                  <Cell key={i} fill={TIME_COLORS[i % TIME_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                                formatter={(v: number) => [`${v}с`]}
                              />
                              <Legend
                                formatter={v => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* BarChart: статистика решателя */}
                    {solverChartData.length > 0 && (
                      <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                        <p className="text-xs font-semibold text-slate-400 mb-3">Статистика SAT-решателя (последняя успешная попытка)</p>
                        <div className="h-52">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={solverChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                              <YAxis
                                stroke="#94a3b8"
                                fontSize={11}
                                tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
                                  : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)}
                              />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                                labelStyle={{ color: '#e2e8f0' }}
                                formatter={(v: number) => [v.toLocaleString('ru-RU')]}
                              />
                              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {solverChartData.map((_, i) => (
                                  <Cell key={i} fill={SOLVER_COLORS[i % SOLVER_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 6. Найденная коллизия ── */}
              {results.success && results.m1_words && (() => {
                const m1 = results.m1_words as string[];
                const m2 = results.m2_words as string[];
                const xorDiff = results.xor_diff as string[] | undefined;
                const hash1 = results.hash1 as string | undefined;
                const hash2 = results.hash2 as string | undefined;
                const hashesMatch = results.hashes_match as boolean | undefined;
                const diffHw = results.diff_hamming_weight as number | undefined;
                const encTime = results.encoding_time as number | undefined;

                return (
                  <div className="bg-slate-800 rounded-xl p-5 border border-green-500/30 space-y-4">
                    <h3 className="text-sm font-semibold text-green-400">6. Найденная коллизия</h3>
                    <p className="text-xs text-slate-400">
                      SAT-решатель нашёл два конкретных сообщения M1 и M2, которые при пропускании через{' '}
                      <span className="text-white font-medium">{hashLabel} ({configRounds} раундов)</span>{' '}
                      дают одинаковый хэш.
                    </p>

                    {/* Messages side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <MessageDisplay
                        words={m1}
                        label="Сообщение M1 (16 слов × 32 бита = 512 бит)"
                        color="text-green-400"
                        hashFunction={configHashFunc}
                      />
                      <MessageDisplay
                        words={m2}
                        label="Сообщение M2 (отличающиеся байты выделены)"
                        color="text-cyan-400"
                        diffWords={m1}
                        hashFunction={configHashFunc}
                      />
                    </div>

                    {/* XOR difference */}
                    {xorDiff && (
                      <div className="text-xs">
                        <p className="text-slate-400 mb-1 font-semibold">
                          XOR-разность: M1 ⊕ M2
                          {diffHw != null && (
                            <span className="text-yellow-400 ml-2">(вес Хэмминга: {diffHw} бит)</span>
                          )}
                        </p>
                        <p className="text-slate-500 mb-1">
                          Показывает, в каких именно битах M1 и M2 различаются. Ненулевые слова выделены жёлтым.
                        </p>
                        <div className="bg-slate-950 rounded-lg p-2 font-mono break-all leading-relaxed">
                          {xorDiff.map((w, i) => {
                            const isActive = w !== '0x00000000';
                            return (
                              <span key={i} className={isActive ? 'text-yellow-400' : 'text-slate-600'}>
                                {w}
                                {i < xorDiff.length - 1 && <span className="text-slate-700"> </span>}
                                {(i + 1) % 4 === 0 && i < xorDiff.length - 1 && <br />}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Hashes */}
                    {hash1 && hash2 && (
                      <div className="text-xs">
                        <p className="text-slate-400 mb-1 font-semibold">
                          Хэши: {hashLabel}, {configRounds} раундов
                          {hashesMatch != null && (
                            <span className={`ml-2 ${hashesMatch ? 'text-green-400' : 'text-red-400'}`}>
                              {hashesMatch ? '— совпадают (коллизия подтверждена)' : '— НЕ совпадают (ошибка!)'}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                        <p className="text-slate-500">Общее время</p>
                        <p className="text-white font-mono font-semibold">{totalTime.toFixed(3)} с</p>
                      </div>
                      {encTime != null && (
                        <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                          <p className="text-slate-500">Кодирование в CNF</p>
                          <p className="text-white font-mono font-semibold">{encTime.toFixed(3)} с</p>
                        </div>
                      )}
                      {solvingTime > 0 && (
                        <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                          <p className="text-slate-500">SAT-решение</p>
                          <p className="text-white font-mono font-semibold">{solvingTime.toFixed(3)} с</p>
                        </div>
                      )}
                      <div className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                        <p className="text-slate-500">Разностей проверено</p>
                        <p className="text-white font-mono font-semibold">{String(results.characteristics_tried ?? '-')}</p>
                      </div>
                    </div>

                    {/* Solver stats */}
                    {solverStats && (
                      <div className="text-xs">
                        <p className="text-slate-400 mb-1 font-semibold">Статистика SAT-решателя</p>
                        <p className="text-slate-500 mb-2">
                          Внутренние метрики CDCL-решателя для последней (успешной) попытки.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                          {[
                            { label: 'Результат', value: solverStats.result, hint: 'SAT = решение найдено' },
                            { label: 'Конфликты', value: (solverStats.num_conflicts ?? 0).toLocaleString(), hint: 'Тупики в поиске' },
                            { label: 'Решения', value: (solverStats.num_decisions ?? 0).toLocaleString(), hint: 'Выбранные значения' },
                            { label: 'Пропагации', value: (solverStats.num_propagations ?? 0).toLocaleString(), hint: 'Выведенные значения' },
                            { label: 'Рестарты', value: (solverStats.num_restarts ?? 0).toLocaleString(), hint: 'Перезапуски поиска' },
                            { label: 'Выученных дизъюнктов', value: (solverStats.num_learnt_clauses ?? 0).toLocaleString(), hint: 'Новые ограничения' },
                          ].map(({ label, value, hint }) => (
                            <div key={label} className="bg-slate-950 rounded-lg p-2 border border-slate-800">
                              <p className="text-slate-500 truncate" title={hint}>{label}</p>
                              <p className="text-white font-mono">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {result.error && (
            <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30">
              <p className="text-red-400 text-sm font-mono">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-3 border border-slate-600">
      <p className="text-xs text-slate-400">{title}</p>
      <p className={`text-lg font-bold font-mono ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}

function ParamTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-2 border border-slate-700">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm text-white font-medium">{value}</p>
    </div>
  );
}
