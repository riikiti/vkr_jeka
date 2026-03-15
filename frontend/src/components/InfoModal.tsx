import { useState, useEffect, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

interface InfoModalProps {
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function InfoModal({ title, children, size = 'md' }: InfoModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const widthClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full
                   text-slate-500 hover:text-cyan-400 hover:bg-slate-700/60
                   transition-colors shrink-0"
        title="Подробнее"
      >
        <Info size={14} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className={`${widthClass} w-full bg-slate-900 border border-slate-700 rounded-xl
                        shadow-2xl max-h-[80vh] flex flex-col`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto text-sm text-slate-300 space-y-3 leading-relaxed">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Styled formula block */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="bg-slate-950 rounded-lg px-3 py-2 font-mono text-sm border border-slate-800
                    text-cyan-300 overflow-x-auto my-2">
      {children}
    </div>
  );
}

/** Inline variable (italic) */
export function V({ children }: { children: ReactNode }) {
  return <span className="italic text-cyan-400">{children}</span>;
}

/** Subscript */
export function Sub({ children }: { children: ReactNode }) {
  return <sub className="text-xs">{children}</sub>;
}

/** Superscript */
export function Sup({ children }: { children: ReactNode }) {
  return <sup className="text-xs">{children}</sup>;
}
