import { useState } from 'react';
import { computeHash, compareHashes } from '../api/hashFunctions';
import type { HashResult, CompareResult } from '../types';

export default function HashPage() {
  const [hashFunc, setHashFunc] = useState('sha256');
  const [rounds, setRounds] = useState(64);
  const [message, setMessage] = useState('616263'); // "abc"
  const [message2, setMessage2] = useState('616264');
  const [hashResult, setHashResult] = useState<HashResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'compute' | 'compare'>('compute');

  const handleCompute = async () => {
    setLoading(true);
    try {
      const res = await computeHash(hashFunc, rounds, message);
      setHashResult(res);
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const handleCompare = async () => {
    setLoading(true);
    try {
      const res = await compareHashes(hashFunc, rounds, message, message2);
      setCompareResult(res);
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Hash Functions</h1>

      {/* Settings */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="grid grid-cols-2 gap-4">
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
            <label className="block text-sm text-slate-400 mb-1">
              Rounds (1-{hashFunc === 'sha256' ? 64 : 80})
            </label>
            <input
              type="number"
              min={1}
              max={hashFunc === 'sha256' ? 64 : 80}
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('compute')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'compute' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          Compute Hash
        </button>
        <button
          onClick={() => setTab('compare')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'compare' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          Compare Two Messages
        </button>
      </div>

      {tab === 'compute' && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Message (hex)</label>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="hex string, e.g. 616263 for 'abc'"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
          <button
            onClick={handleCompute}
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium
                       disabled:opacity-50 transition-colors"
          >
            {loading ? 'Computing...' : 'Compute'}
          </button>

          {hashResult && (
            <div className="mt-4 bg-slate-900 rounded-lg p-4 border border-slate-600">
              <p className="text-xs text-slate-400 mb-1">Hash ({hashResult.hash_function}, {hashResult.num_rounds} rounds)</p>
              <p className="font-mono text-green-400 break-all">{hashResult.hash_hex}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'compare' && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Message 1 (hex)</label>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Message 2 (hex)</label>
            <input
              value={message2}
              onChange={e => setMessage2(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
          <button
            onClick={handleCompare}
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium
                       disabled:opacity-50 transition-colors"
          >
            {loading ? 'Comparing...' : 'Compare'}
          </button>

          {compareResult && (
            <div className="mt-4 bg-slate-900 rounded-lg p-4 border border-slate-600 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Hash 1</p>
                  <p className="font-mono text-sm text-green-400 break-all">{compareResult.hash1_hex}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Hash 2</p>
                  <p className="font-mono text-sm text-green-400 break-all">{compareResult.hash2_hex}</p>
                </div>
              </div>
              <div className="flex gap-6 mt-3">
                <div>
                  <p className="text-xs text-slate-400">Match</p>
                  <p className={`font-bold ${compareResult.hashes_equal ? 'text-green-400' : 'text-red-400'}`}>
                    {compareResult.hashes_equal ? 'COLLISION!' : 'Different'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Hamming Distance</p>
                  <p className="font-mono text-yellow-400">{compareResult.hamming_distance} bits</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400">XOR Difference</p>
                <p className="font-mono text-xs text-orange-400 break-all">{compareResult.xor_diff_hex}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
