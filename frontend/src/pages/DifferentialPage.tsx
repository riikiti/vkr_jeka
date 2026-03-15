import { useState } from 'react';
import { validateDifferential } from '../api/experiments';
import type { DiffValidationResult } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';
import InfoModal from '../components/InfoModal';
import { diffCharacteristic, diffResults } from '../data/infoContent';

const HASH_INFO: Record<string, { label: string; maxRounds: number }> = {
  sha256: { label: 'SHA-256', maxRounds: 64 },
  sha1:   { label: 'SHA-1',   maxRounds: 80 },
  md5:    { label: 'MD5',     maxRounds: 64 },
  md4:    { label: 'MD4',     maxRounds: 48 },
};

export default function DifferentialPage() {
  const [hashFunc, setHashFunc] = useState('sha256');
  const [rounds, setRounds] = useState(8);
  const [diffWord0, setDiffWord0] = useState('80000000');
  const [numSamples, setNumSamples] = useState(65536);
  const [result, setResult] = useState<DiffValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const currentInfo = HASH_INFO[hashFunc] ?? HASH_INFO.sha256;

  const handleValidate = async () => {
    setLoading(true);
    try {
      const messageDiff = [diffWord0, ...Array(15).fill('00000000')];
      const res = await validateDifferential(hashFunc, rounds, messageDiff, numSamples);
      setResult(res);
    } catch (e: unknown) {
      alert('Ошибка: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const wordChartData = result
    ? result.partial_match_rates.map((rate, i) => ({ word: `W${i}`, rate }))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Дифференциальный анализ</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Проверка дифференциальной характеристики</h2>
          <InfoModal title={diffCharacteristic.title}>{diffCharacteristic.content}</InfoModal>
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
            <label className="block text-sm text-slate-400 mb-1">Выборок</label>
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
            <label className="block text-sm text-slate-400 mb-1">Разность W[0] (hex)</label>
            <input
              value={diffWord0}
              onChange={e => setDiffWord0(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Разность применяется к первому слову сообщения (W[0]). Остальные слова: нулевая разность.
        </p>

        <button
          onClick={handleValidate}
          disabled={loading}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium
                     disabled:opacity-50 transition-colors"
        >
          {loading ? 'Выполнение...' : 'Проверить'}
        </button>
      </div>

      {result && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-200">Результаты</h2>
            <InfoModal title={diffResults.title}>{diffResults.content}</InfoModal>
          </div>

          {/* Сводные карточки */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ResultCard title="Выборок" value={result.num_samples.toLocaleString('ru-RU')} />
            <ResultCard title="Коллизий" value={result.collisions.toString()} />
            <ResultCard
              title="Частота коллизий"
              value={result.collision_rate > 0 ? result.collision_rate.toExponential(3) : '0'}
              color={result.collisions > 0 ? 'text-green-400' : 'text-slate-400'}
            />
            <ResultCard
              title="Log₂ вероятности"
              value={
                result.collision_rate > 0
                  ? Math.log2(result.collision_rate).toFixed(2)
                  : '-∞'
              }
            />
          </div>

          {/* График частичных совпадений по словам */}
          <div>
            <p className="text-sm font-semibold text-slate-300 mb-1">
              Доля частичных совпадений по словам выходного состояния
            </p>
            <p className="text-xs text-slate-500 mb-3">
              Пунктирная линия — случайный baseline (50%). Зелёный ≥ 50%, красный &lt; 50%.
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={wordChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <YAxis
                    type="category"
                    dataKey="word"
                    stroke="#94a3b8"
                    fontSize={11}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, 'Совпадение']}
                  />
                  <ReferenceLine
                    x={0.5}
                    stroke="#facc15"
                    strokeDasharray="4 3"
                    label={{ value: '50%', fill: '#facc15', fontSize: 11, position: 'insideTopRight' }}
                  />
                  <Bar dataKey="rate" radius={[0, 3, 3, 0]}>
                    {wordChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.rate >= 0.5 ? '#4ade80' : '#f87171'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
