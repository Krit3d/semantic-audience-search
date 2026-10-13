import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Check, AlertTriangle, RotateCw } from 'lucide-react';

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-block animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 ${className}`}
      style={{ width: size, height: size }} role="status" aria-label="Загрузка" />
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} style={style} />;
}

export function SkeletonLines({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${92 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}

export function Empty({ icon, title, text, action, className = '' }: {
  icon?: ReactNode; title: string; text?: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      {icon && <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mb-3">{icon}</div>}
      <div className="text-[14.5px] font-bold text-ink">{title}</div>
      {text && <div className="text-[12.5px] font-medium text-muted mt-1.5 max-w-[360px] leading-relaxed">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className = '' }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-3"><AlertTriangle size={22} /></div>
      <div className="text-[14.5px] font-bold text-ink">Что-то пошло не так</div>
      <div className="text-[12.5px] font-medium text-muted mt-1.5 max-w-[380px] leading-relaxed">{message}</div>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors">
          <RotateCw size={14} />Повторить
        </button>
      )}
    </div>
  );
}

export interface SelectOption { v: string; label: string }

export function Select({ options, value, onChange, label, width = 180, size = 'sm', className = '' }: {
  options: SelectOption[]; value: string; onChange: (v: string) => void;
  label: string; width?: number | string; size?: 'sm' | 'md'; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const md = size === 'md';
  const cur = options.find(o => o.v === value) ?? options[0] ?? { v: '', label: '' };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex max-w-full ${className}`} style={{ width }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 box-border ${md ? 'h-[38px] text-[13.5px] font-medium' : 'h-9 text-[12.5px] font-semibold'} pl-3 pr-2.5 rounded-lg border bg-white text-ink transition-all hover:border-brand-200 ${open ? 'border-brand-300 shadow-[0_0_0_3px_#e0e7ff]' : 'border-line'}`}>
        <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left">{cur.label}</span>
        <ChevronDown size={14} className={`shrink-0 text-brand-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Закрыть список" tabIndex={-1} onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default border-0 bg-transparent" />
          <div role="listbox" aria-label={label}
            className="absolute left-0 top-[calc(100%+6px)] z-[41] min-w-full w-max max-w-[320px] max-h-[300px] overflow-y-auto scroll-thin box-border p-1.5 rounded-xl border border-line bg-white shadow-brand-pop pop-in">
            {options.map(o => {
              const sel = o.v === cur.v;
              return (
                <button key={o.v} type="button" role="option" aria-selected={sel}
                  onClick={() => { setOpen(false); onChange(o.v); }}
                  className={`w-full flex items-center gap-2.5 min-h-[34px] px-2.5 border-0 rounded-lg text-[13px] whitespace-nowrap transition-colors ${
                    sel ? 'bg-brand-50 text-brand-800 font-bold' : 'bg-transparent text-body font-medium hover:bg-[#f5f7ff]'}`}>
                  <span className="flex-1 text-left">{o.label}</span>
                  {sel && <Check size={14} className="text-brand-600" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function FilterPill({ options, value, onChange, prefix = '', multi = false, empty = 'Все', hint = '', className = '' }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void;
  prefix?: string; multi?: boolean; empty?: string; hint?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = value.length ? (multi ? options.filter(o => value.includes(o)).join(', ') : value[0]) : empty;

  return (
    <div className={`relative inline-flex font-collab ${className}`}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} title={hint} onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 h-[42px] pl-3.5 pr-3 rounded-full border text-[14.5px] font-medium text-ink whitespace-nowrap transition-all ${
          open ? 'border-[#a5a1f2] bg-white shadow-[0_0_0_3px_#ecebff]' : 'border-[#e3e5ec] bg-[#f3f4f8] hover:border-[#c7c4f5]'}`}>
        {prefix && <span className="text-muted">{prefix}</span>}
        <span>{current}</span>
        <ChevronDown size={13} className={`shrink-0 ml-0.5 text-brand-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Закрыть список" tabIndex={-1} onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default border-0 bg-transparent" />
          <div role="listbox" aria-multiselectable={multi}
            className="absolute left-0 top-[calc(100%+8px)] z-[41] min-w-full w-max max-w-[300px] box-border p-1.5 rounded-2xl border border-line-soft bg-white shadow-[0_20px_44px_-16px_rgba(30,27,75,.35)] pop-in">
            {options.map(o => {
              const on = value.includes(o);
              return (
                <button key={o} type="button" role="option" aria-selected={on}
                  onClick={() => {
                    if (multi) onChange(on ? value.filter(x => x !== o) : [...value, o]);
                    else { onChange([o]); setOpen(false); }
                  }}
                  className={`w-full flex items-center gap-2.5 min-h-[38px] px-3 border-0 rounded-[10px] text-[14px] whitespace-nowrap transition-colors ${
                    on && !multi ? 'bg-[#efedff] text-brand-800 font-bold' : 'bg-transparent text-body font-medium hover:bg-[#f5f4ff]'}`}>
                  {multi && (
                    <span className={`w-[18px] h-[18px] box-border rounded-md shrink-0 flex items-center justify-center ${on ? 'bg-brand-600' : 'bg-white border-[1.5px] border-[#cbd0dc]'}`}>
                      {on && <Check size={11} strokeWidth={3.4} className="text-white" />}
                    </span>
                  )}
                  <span className="flex-1 text-left">{o}</span>
                  {on && !multi && <Check size={14} className="text-brand-600" />}
                </button>
              );
            })}
            {multi && (
              <div className="flex gap-1.5 px-1 pt-1.5 mt-1 border-t border-[#f0f1f5]">
                <button type="button" onClick={() => onChange([])}
                  className="h-8 px-2.5 rounded-full text-[13px] font-semibold text-muted hover:text-ink transition-colors">Сбросить</button>
                <button type="button" onClick={() => setOpen(false)}
                  className="ml-auto h-8 px-3.5 rounded-full bg-brand-600 text-white text-[13px] font-bold hover:bg-brand-700 transition-colors">Готово</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const statusTones: Record<string, string> = {
  'Активен': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Опубликован': 'bg-blue-50 text-blue-700 border-blue-200',
  'Ожидает публикации': 'bg-amber-50 text-amber-800 border-amber-200',
  'Заполняют данные': 'bg-violet-50 text-violet-700 border-violet-200',
  'Архивирован': 'bg-gray-100 text-gray-600 border-gray-200',
  'Черновик': 'bg-gray-100 text-gray-600 border-gray-200',
};

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const tone = statusTones[status] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center text-[11.5px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${tone} ${className}`}>
      {status}
    </span>
  );
}
