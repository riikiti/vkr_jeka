import { useState } from 'react';
import { runExperiment } from '../api/experiments';
import type { ExperimentResult } from '../types';

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
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const results = result?.results as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Run Experiment</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-5">
        {/* Row 1: Hash function and rounds */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Hash Function</label>
            <select
              value={hashFunc}
              onChange={e => setHashFunc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="sha256">SHA-256</option>
              <option value="sha1">SHA-1</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Rounds</label>
            <input
              type="number"
              min={1}
              max={hashFunc === 'sha256' ? 64 : 80}
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="combined">Combined (Diff+SAT)</option>
              <option value="pure_sat">Pure SAT</option>
              <option value="pure_differential">Pure Differential</option>
            </select>
          </div>
          {method === 'combined' && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Strategy</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="sequential">Sequential</option>
                <option value="iterative">Iterative</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          )}
        </div>

        {/* Row 2: Solver params */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">SAT Solver</label>
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
          <div>
            <label className="block text-sm text-slate-400 mb-1">Timeout (s)</label>
            <input
              type="number"
              min={10}
              max={7200}
              value={timeout}
              onChange={e => setTimeout_(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Max Characteristics</label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxChars}
              onChange={e => setMaxChars(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Seed</label>
            <input
              type="number"
              value={seed}
              onChange={e => setSeed(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={loading}
          className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold
                     disabled:opacity-50 transition-colors text-lg"
        >
          {loading ? 'Running experiment...' : 'Run Experiment'}
        </button>

        {loading && (
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>SAT solver is working, this may take a while...</span>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Results</h2>
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                result.status === 'completed'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {result.status}
            </span>
            <span className="text-xs text-slate-500 font-mono">ID: {result.id}</span>
          </div>

          {results && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  title="Collision Found"
                  value={results.success ? 'YES' : 'NO'}
                  color={results.success ? 'text-green-400' : 'text-red-400'}
                />
                <MetricCard
                  title="Total Time"
                  value={`${(results.total_time as number)?.toFixed(2)}s`}
                />
                <MetricCard
                  title="Characteristics Tried"
                  value={String(results.characteristics_tried ?? '-')}
                />
                <MetricCard
                  title="Solving Time"
                  value={`${(results.solving_time as number)?.toFixed(2) ?? '-'}s`}
                />
              </div>

              {results.solver_stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard
                    title="Conflicts"
                    value={String((results.solver_stats as Record<string, unknown>).num_conflicts ?? '-')}
                  />
                  <MetricCard
                    title="Decisions"
                    value={String((results.solver_stats as Record<string, unknown>).num_decisions ?? '-')}
                  />
                  <MetricCard
                    title="Propagations"
                    value={String((results.solver_stats as Record<string, unknown>).num_propagations ?? '-')}
                  />
                  <MetricCard
                    title="Restarts"
                    value={String((results.solver_stats as Record<string, unknown>).num_restarts ?? '-')}
                  />
                </div>
              )}

              {results.success && results.m1_words && (
                <div className="bg-slate-900 rounded-lg p-4 border border-green-500/30 space-y-2">
                  <h3 className="text-sm font-semibold text-green-400">Collision Pair Found!</h3>
                  <div>
                    <p className="text-xs text-slate-400">Message 1</p>
                    <p className="font-mono text-xs text-slate-200 break-all">
                      {(results.m1_words as string[]).join(' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Message 2</p>
                    <p className="font-mono text-xs text-slate-200 break-all">
                      {(results.m2_words as string[]).join(' ')}
                    </p>
                  </div>
                </div>
              )}
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
