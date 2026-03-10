import { useState } from 'react';
import { validateDifferential } from '../api/experiments';
import type { DiffValidationResult } from '../types';

export default function DifferentialPage() {
  const [hashFunc, setHashFunc] = useState('sha256');
  const [rounds, setRounds] = useState(8);
  const [diffWord0, setDiffWord0] = useState('80000000');
  const [numSamples, setNumSamples] = useState(65536);
  const [result, setResult] = useState<DiffValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleValidate = async () => {
    setLoading(true);
    try {
      const messageDiff = [diffWord0, ...Array(15).fill('00000000')];
      const res = await validateDifferential(hashFunc, rounds, messageDiff, numSamples);
      setResult(res);
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Differential Analysis</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Validate Differential Characteristic</h2>

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
            <label className="block text-sm text-slate-400 mb-1">Samples</label>
            <select
              value={numSamples}
              onChange={e => setNumSamples(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value={1024}>1K</option>
              <option value={16384}>16K</option>
              <option value={65536}>64K</option>
              <option value={262144}>256K</option>
              <option value={1048576}>1M</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Message Diff W[0] (hex)</label>
            <input
              value={diffWord0}
              onChange={e => setDiffWord0(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Difference applied to first message word (W[0]). All other words: zero difference.
        </p>

        <button
          onClick={handleValidate}
          disabled={loading}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium
                     disabled:opacity-50 transition-colors"
        >
          {loading ? 'Running...' : 'Validate'}
        </button>
      </div>

      {result && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Results</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ResultCard title="Samples" value={result.num_samples.toLocaleString()} />
            <ResultCard title="Collisions" value={result.collisions.toString()} />
            <ResultCard
              title="Collision Rate"
              value={result.collision_rate > 0 ? result.collision_rate.toExponential(3) : '0'}
              color={result.collisions > 0 ? 'text-green-400' : 'text-slate-400'}
            />
            <ResultCard
              title="Log2 Probability"
              value={
                result.collision_rate > 0
                  ? (Math.log2(result.collision_rate)).toFixed(2)
                  : '-inf'
              }
            />
          </div>

          <div>
            <p className="text-sm text-slate-400 mb-2">Per-Word Partial Match Rates</p>
            <div className="flex gap-2 flex-wrap">
              {result.partial_match_rates.map((rate, i) => (
                <div
                  key={i}
                  className="bg-slate-900 rounded px-3 py-1 text-xs font-mono border border-slate-600"
                  style={{
                    borderColor: rate > 0.5
                      ? `rgba(74, 222, 128, ${rate})`
                      : `rgba(248, 113, 113, ${1 - rate})`,
                  }}
                >
                  <span className="text-slate-500">W{i}: </span>
                  <span className={rate > 0.5 ? 'text-green-400' : 'text-red-400'}>
                    {(rate * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-3 border border-slate-600">
      <p className="text-xs text-slate-400">{title}</p>
      <p className={`text-lg font-bold font-mono ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}
