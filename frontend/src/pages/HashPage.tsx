import { useState } from 'react';
import { computeHash, compareHashes } from '../api/hashFunctions';
import type { HashResult, CompareResult } from '../types';
import InfoModal from '../components/InfoModal';
import { hashSettings, hashCompute, hashCompare } from '../data/infoContent';

type InputMode = 'text' | 'hex';

function toHex(value: string, mode: InputMode): string {
  if (mode === 'hex') return value;
  return Array.from(new TextEncoder().encode(value))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): string {
  try {
    const bytes = hex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) ?? [];
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return hex;
  }
}

const HASH_INFO: Record<string, { label: string; maxRounds: number; defaultRounds: number }> = {
  sha256: { label: 'SHA-256', maxRounds: 64, defaultRounds: 64 },
  sha1:   { label: 'SHA-1',   maxRounds: 80, defaultRounds: 80 },
  md5:    { label: 'MD5',     maxRounds: 64, defaultRounds: 64 },
  md4:    { label: 'MD4',     maxRounds: 48, defaultRounds: 48 },
};

export default function HashPage() {
  const [hashFunc, setHashFunc] = useState('sha256');
  const [rounds, setRounds] = useState(64);

  const currentInfo = HASH_INFO[hashFunc] ?? HASH_INFO.sha256;
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [message, setMessage] = useState('abc');
  const [message2, setMessage2] = useState('abd');
  const [hashResult, setHashResult] = useState<HashResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'compute' | 'compare'>('compute');

  const handleModeChange = (mode: InputMode) => {
    if (mode === inputMode) return;
    if (mode === 'hex') {
      setMessage(toHex(message, 'text'));
      setMessage2(toHex(message2, 'text'));
    } else {
      setMessage(fromHex(message));
      setMessage2(fromHex(message2));
    }
    setInputMode(mode);
  };

  const handleCompute = async () => {
    setLoading(true);
    try {
      const res = await computeHash(hashFunc, rounds, toHex(message, inputMode));
      setHashResult(res);
    } catch (e: unknown) {
      alert('Ошибка: ' + (e as Error).message);
    }
    setLoading(false);
  };

  const handleCompare = async () => {
    setLoading(true);
    try {
      const res = await compareHashes(hashFunc, rounds, toHex(message, inputMode), toHex(message2, inputMode));
      setCompareResult(res);
    } catch (e: unknown) {
      alert('Ошибка: ' + (e as Error).message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Хэш-функции</h1>

      {/* Настройки */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Параметры</h2>
          <InfoModal title={hashSettings.title}>{hashSettings.content}</InfoModal>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Хэш-функция</label>
            <select
              value={hashFunc}
              onChange={e => {
                const v = e.target.value;
                setHashFunc(v);
                setRounds(HASH_INFO[v]?.defaultRounds ?? 64);
              }}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
            >
              {Object.entries(HASH_INFO).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Раунды (1–{currentInfo.maxRounds})
            </label>
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
            <label className="block text-sm text-slate-400 mb-1">Формат ввода</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                onClick={() => handleModeChange('text')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'text' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Текст
              </button>
              <button
                onClick={() => handleModeChange('hex')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'hex' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Hex
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('compute')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'compute' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Вычислить хэш
          </button>
          {tab === 'compute' && <InfoModal title={hashCompute.title} size="sm">{hashCompute.content}</InfoModal>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('compare')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'compare' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Сравнить два сообщения
          </button>
          {tab === 'compare' && <InfoModal title={hashCompare.title} size="sm">{hashCompare.content}</InfoModal>}
        </div>
      </div>

      {tab === 'compute' && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Сообщение {inputMode === 'hex' ? '(hex)' : '(текст)'}
            </label>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={inputMode === 'text' ? 'например: hello world' : 'например: 68656c6c6f'}
              className={`w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white ${inputMode === 'hex' ? 'font-mono' : ''}`}
            />
            {inputMode === 'text' && message && (
              <p className="text-xs text-slate-500 mt-1 font-mono">hex: {toHex(message, 'text')}</p>
            )}
          </div>
          <button
            onClick={handleCompute}
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium
                       disabled:opacity-50 transition-colors"
          >
            {loading ? 'Вычисление...' : 'Вычислить'}
          </button>

          {hashResult && (
            <div className="mt-4 bg-slate-900 rounded-lg p-4 border border-slate-600">
              <p className="text-xs text-slate-400 mb-1">Хэш ({hashResult.hash_function}, {hashResult.num_rounds} раундов)</p>
              <p className="font-mono text-green-400 break-all">{hashResult.hash_hex}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'compare' && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Сообщение 1 {inputMode === 'hex' ? '(hex)' : '(текст)'}
            </label>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={inputMode === 'text' ? 'например: hello' : 'например: 68656c6c6f'}
              className={`w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white ${inputMode === 'hex' ? 'font-mono' : ''}`}
            />
            {inputMode === 'text' && message && (
              <p className="text-xs text-slate-500 mt-1 font-mono">hex: {toHex(message, 'text')}</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Сообщение 2 {inputMode === 'hex' ? '(hex)' : '(текст)'}
            </label>
            <input
              value={message2}
              onChange={e => setMessage2(e.target.value)}
              placeholder={inputMode === 'text' ? 'например: hellp' : 'например: 68656c6c70'}
              className={`w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white ${inputMode === 'hex' ? 'font-mono' : ''}`}
            />
            {inputMode === 'text' && message2 && (
              <p className="text-xs text-slate-500 mt-1 font-mono">hex: {toHex(message2, 'text')}</p>
            )}
          </div>
          <button
            onClick={handleCompare}
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium
                       disabled:opacity-50 transition-colors"
          >
            {loading ? 'Сравнение...' : 'Сравнить'}
          </button>

          {compareResult && (
            <div className="mt-4 bg-slate-900 rounded-lg p-4 border border-slate-600 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Хэш 1</p>
                  <p className="font-mono text-sm text-green-400 break-all">{compareResult.hash1_hex}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Хэш 2</p>
                  <p className="font-mono text-sm text-green-400 break-all">{compareResult.hash2_hex}</p>
                </div>
              </div>
              <div className="flex gap-6 mt-3">
                <div>
                  <p className="text-xs text-slate-400">Совпадение</p>
                  <p className={`font-bold ${compareResult.hashes_equal ? 'text-green-400' : 'text-red-400'}`}>
                    {compareResult.hashes_equal ? 'КОЛЛИЗИЯ!' : 'Различаются'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Расстояние Хэмминга</p>
                  <p className="font-mono text-yellow-400">{compareResult.hamming_distance} бит</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400">XOR-разность</p>
                <p className="font-mono text-xs text-orange-400 break-all">{compareResult.xor_diff_hex}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
