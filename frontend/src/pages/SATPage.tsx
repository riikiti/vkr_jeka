import { useState } from 'react';
import { encodeSAT } from '../api/experiments';
import type { SATEncodeResult } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import InfoModal from '../components/InfoModal';
import { satEncoding, satStats } from '../data/infoContent';

const HASH_INFO: Record<string, { label: string; maxRounds: number }> = {
  sha256: { label: 'SHA-256', maxRounds: 64 },
  md5:    { label: 'MD5',     maxRounds: 64 },
  md4:    { label: 'MD4',     maxRounds: 48 },
};

export default function SATPage() {
  const [hashFunc, setHashFunc] = useState('sha256');
  const [rounds, setRounds] = useState(8);
  const [encodeType, setEncodeType] = useState('single');
  const [result, setResult] = useState<SATEncodeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const currentInfo = HASH_INFO[hashFunc] ?? HASH_INFO.sha256;

  const handleEncode = async () => {
    setLoading(true);
    try {
      const res = await encodeSAT(hashFunc, rounds, encodeType);
      setResult(res);
    } catch (e: unknown) {
      alert('Ошибка: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const chartData = result
    ? Object.entries(result.clause_length_distribution).map(([len, count]) => ({
        length: `${len}-лит`,
        count: count as number,
      }))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">SAT-кодирование</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Кодирование хэш-функции в CNF</h2>
          <InfoModal title={satEncoding.title}>{satEncoding.content}</InfoModal>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Хэш-функция</label>
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
          <div>
            <label className="block text-sm text-slate-400 mb-1">Раунды (1–{currentInfo.maxRounds})</label>
            <input
              type="number"
              min={1}
              max={currentInfo.maxRounds}
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Тип кодирования</label>
            <select
              value={encodeType}
              onChange={e => setEncodeType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="single">Одиночный хэш</option>
              <option value="collision">Поиск коллизии</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleEncode}
              disabled={loading}
              className="w-full px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg
                         font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? 'Кодирование...' : 'Закодировать'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Статистика CNF</h2>
            <InfoModal title={satStats.title} size="sm">{satStats.content}</InfoModal>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase">Переменные</p>
              <p className="text-3xl font-bold text-cyan-400 font-mono">
                {result.num_variables.toLocaleString('ru-RU')}
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase">Дизъюнкты</p>
              <p className="text-3xl font-bold text-orange-400 font-mono">
                {result.num_clauses.toLocaleString('ru-RU')}
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400 uppercase">Соотношение (дизъюнкты/перем.)</p>
              <p className="text-3xl font-bold text-purple-400 font-mono">
                {(result.num_clauses / result.num_variables).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Распределение длин дизъюнктов</h3>
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
