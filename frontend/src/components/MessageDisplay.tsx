import { useState } from 'react';

type DisplayMode = 'hex' | 'text' | 'bytes';

/** Convert "0x1a2b3c4d" hex word to 4 bytes (big-endian by default). */
function hexWordToBytes(hex: string, littleEndian = false): number[] {
  const n = parseInt(hex, 16) >>> 0;
  const bytes = [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ];
  return littleEndian ? bytes.reverse() : bytes;
}

/** Is byte a printable ASCII char (0x20..0x7e)? */
function isPrintable(b: number): boolean {
  return b >= 0x20 && b <= 0x7e;
}

/** Convert array of hex word strings to byte array. */
function wordsToBytes(words: string[], littleEndian = false): number[] {
  return words.flatMap(w => hexWordToBytes(w, littleEndian));
}

/** Render bytes as ASCII text with dots for non-printable. */
function bytesToAscii(bytes: number[]): { char: string; printable: boolean }[] {
  return bytes.map(b => ({
    char: isPrintable(b) ? String.fromCharCode(b) : '.',
    printable: isPrintable(b),
  }));
}

interface MessageDisplayProps {
  words: string[];
  label: string;
  color: string;          // tailwind text color class, e.g. "text-green-400"
  diffWords?: string[];   // other message's words — to highlight differences
  hashFunction?: string;  // "sha256" | "md5" | "md4" — for endianness
}

export default function MessageDisplay({ words, label, color, diffWords, hashFunction }: MessageDisplayProps) {
  const [mode, setMode] = useState<DisplayMode>('hex');
  const littleEndian = hashFunction === 'md5' || hashFunction === 'md4';

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-slate-400 font-semibold text-xs">{label}</p>
        <div className="flex bg-slate-800 rounded overflow-hidden border border-slate-700">
          {(['hex', 'text', 'bytes'] as DisplayMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                mode === m
                  ? 'bg-slate-600 text-white'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {m === 'hex' ? 'Hex' : m === 'text' ? 'Текст' : 'Байты'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'hex' && (
        <div className={`bg-slate-950 rounded-lg p-2 font-mono ${color} break-all leading-relaxed text-xs`}>
          {words.map((w, i) => {
            const differs = diffWords ? words[i] !== diffWords[i] : false;
            return (
              <span key={i} className={differs ? 'text-yellow-400 font-bold' : ''}>
                {w}
                {i < words.length - 1 && <span className="text-slate-600"> </span>}
                {(i + 1) % 4 === 0 && i < words.length - 1 && <br />}
              </span>
            );
          })}
        </div>
      )}

      {mode === 'text' && (() => {
        const bytes = wordsToBytes(words, littleEndian);
        const chars = bytesToAscii(bytes);
        // Show 16 bytes per line (= 4 words)
        const lines: typeof chars[] = [];
        for (let i = 0; i < chars.length; i += 16) {
          lines.push(chars.slice(i, i + 16));
        }

        // If we have diffWords, compute diff bytes for highlighting
        let diffBytes: boolean[] | null = null;
        if (diffWords) {
          const otherBytes = wordsToBytes(diffWords, littleEndian);
          diffBytes = bytes.map((b, i) => b !== otherBytes[i]);
        }

        let byteIdx = 0;
        return (
          <div className="bg-slate-950 rounded-lg p-2 font-mono text-xs leading-relaxed">
            {lines.map((line, li) => (
              <div key={li} className="flex">
                <span className="text-slate-600 w-10 shrink-0 select-none">
                  {(li * 16).toString(16).padStart(3, '0')}:
                </span>
                <span>
                  {line.map((c, ci) => {
                    const idx = byteIdx++;
                    const isDiff = diffBytes ? diffBytes[idx] : false;
                    return (
                      <span
                        key={ci}
                        className={
                          isDiff
                            ? 'text-yellow-400 font-bold'
                            : c.printable
                            ? color
                            : 'text-slate-600'
                        }
                        title={`0x${bytes[idx].toString(16).padStart(2, '0')}`}
                      >
                        {c.char}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
            <p className="text-slate-600 mt-1 text-[10px]">
              {littleEndian ? 'Little-endian' : 'Big-endian'} / {bytes.length} байт
              {diffWords && (() => {
                const otherBytes = wordsToBytes(diffWords, littleEndian);
                const diffCount = bytes.filter((b, i) => b !== otherBytes[i]).length;
                return diffCount > 0
                  ? <span className="text-yellow-400"> / {diffCount} байт различаются</span>
                  : null;
              })()}
            </p>
          </div>
        );
      })()}

      {mode === 'bytes' && (() => {
        const bytes = wordsToBytes(words, littleEndian);
        const lines: number[][] = [];
        for (let i = 0; i < bytes.length; i += 16) {
          lines.push(bytes.slice(i, i + 16));
        }

        let diffBytes: boolean[] | null = null;
        if (diffWords) {
          const otherBytes = wordsToBytes(diffWords, littleEndian);
          diffBytes = bytes.map((b, i) => b !== otherBytes[i]);
        }

        let byteIdx = 0;
        return (
          <div className="bg-slate-950 rounded-lg p-2 font-mono text-xs leading-relaxed">
            {lines.map((line, li) => {
              const ascii = bytesToAscii(line);
              return (
                <div key={li} className="flex gap-4">
                  <span className="text-slate-600 w-10 shrink-0 select-none">
                    {(li * 16).toString(16).padStart(3, '0')}:
                  </span>
                  <span className="w-[24.5ch] md:w-auto">
                    {line.map((b, bi) => {
                      const idx = byteIdx++;
                      const isDiff = diffBytes ? diffBytes[idx] : false;
                      return (
                        <span key={bi}>
                          <span className={isDiff ? 'text-yellow-400 font-bold' : color}>
                            {b.toString(16).padStart(2, '0')}
                          </span>
                          {bi < line.length - 1 && (
                            <span className="text-slate-700">{(bi + 1) % 4 === 0 ? '  ' : ' '}</span>
                          )}
                        </span>
                      );
                    })}
                  </span>
                  <span className="text-slate-600 hidden md:inline select-none">|</span>
                  <span className="hidden md:inline">
                    {ascii.map((c, ci) => (
                      <span key={ci} className={c.printable ? 'text-slate-400' : 'text-slate-700'}>
                        {c.char}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
