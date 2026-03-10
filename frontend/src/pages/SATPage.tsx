import { useState } from 'react';
import { encodeSAT } from '../api/experiments';
import type { SATEncodeResult } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function SATPage() {
  const [rounds, setRounds] = useState(8);
  const [encodeType, setEncodeType] = useState('single');
  const [result, setResult] = useState<SATEncodeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEncode = async () => {
    setLoading(true);
    try {
      const res = await encodeSAT('sha256', rounds, encodeType);
      setResult(res);
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const chartData = result
    ? Object.entries(result.clause_length_distribution).map(([len, count]) => ({
        length: `${len}-lit`,
        count: count as number,
      }))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">SAT Encoding</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Encode SHA-256 to CNF</h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Rounds (1-64)</label>
            <input
              type="number"
              min={1}
              max={64}
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Encoding Type</label>
            <select
              value={encodeType}
              onChange={e => setEncodeType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="single">Single Hash</option>
              <option value="collision">Collision Search</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleEncode}
              disabled={loading}
              className="w-full px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg
                         font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? 'Encoding...' : 'Encode'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase">Variables</p>
              <p className="text-3xl font-bold text-cyan-400 font-mono">
                {result.num_variables.toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase">Clauses</p>
              <p className="text-3xl font-bold text-orange-400 font-mono">
                {result.num_clauses.toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase">Ratio (clauses/vars)</p>
              <p className="text-3xl font-bold text-purple-400 font-mono">
                {(result.num_clauses / result.num_variables).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Clause Length Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="length" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
