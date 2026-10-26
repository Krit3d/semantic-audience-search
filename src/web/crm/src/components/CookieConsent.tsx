import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { legalUrl } from '../services/api';

// Модель согласия та же, что на лендинге и в поиске:
// cookie cf_cookie_consent (JSON, 1 год, домен верхнего уровня) + зеркало в localStorage.

const CONSENT_COOKIE = 'cf_cookie_consent';
const CONSENT_STORAGE_KEY = 'cf_cookie_consent';
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 1 год
const LEGACY_ACCEPT_KEY = 'cf_cookie_accepted';
const SETTINGS_EVENT = 'cf:cookie-settings';
const CHANGED_EVENT = 'cf:consent-changed';

export interface Consent {
  v: number;
  ts: number;
  technical: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

function cookieDomain(): string {
  const host = window.location.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes('.')) return '';
  const parts = host.split('.');
  return '; Domain=.' + parts.slice(-2).join('.');
}

function normalize(payload: unknown): Consent | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  return {
    v: 1,
    ts: typeof p.ts === 'number' ? p.ts : Math.floor(Date.now() / 1000),
    technical: true,
    functional: p.functional === true,
    analytics: p.analytics === true,
    marketing: p.marketing === true,
  };
}

function readConsent(): Consent | null {
  const row = document.cookie.split(/;\s*/).find(r => r.startsWith(CONSENT_COOKIE + '='));
  if (row) {
    try {
      const parsed = normalize(JSON.parse(decodeURIComponent(row.slice(CONSENT_COOKIE.length + 1))));
      if (parsed) return parsed;
    } catch { /* ignore */ }
  }
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    const parsed = raw ? normalize(JSON.parse(raw)) : null;
    if (parsed) return parsed;
  } catch { /* ignore */ }
  return null;
}

export function getConsent(): Consent | null {
  const existing = readConsent();
  if (existing) return existing;
  try {
    if (window.localStorage.getItem(LEGACY_ACCEPT_KEY)) {
      return saveConsent({ functional: true, analytics: true, marketing: true });
    }
  } catch { /* ignore */ }
  return null;
}

export function saveConsent(partial: { functional: boolean; analytics: boolean; marketing: boolean }): Consent {
  const consent = normalize({ ...partial, ts: Math.floor(Date.now() / 1000) }) as Consent;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${cookieDomain()}${secure}`;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
    window.localStorage.removeItem(LEGACY_ACCEPT_KEY);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: consent }));
  return consent;
}

export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}

const CATEGORIES: { id: 'technical' | 'functional' | 'analytics' | 'marketing'; title: string; locked?: boolean; description: string; details?: [string, string, string][]; offNote?: string }[] = [
  {
    id: 'technical',
    title: 'Технические (обязательные)',
    locked: true,
    description: 'Без них CRM не заработает: авторизация и безопасность. Не используются для маркетинга и отслеживания.',
    details: [
      ['cf_auth', 'признак авторизованной сессии для маршрутизации', '30 дней'],
      ['cf_cookie_consent', 'ваш выбор настроек cookie', '1 год'],
      ['creatorflow_token (localStorage)', 'токен сессии CRM и поиска', 'до выхода из аккаунта'],
    ],
  },
  {
    id: 'functional',
    title: 'Функциональные',
    description: 'Запоминают ваши настройки и предпочтения в интерфейсе. Хранятся только на наших серверах и в вашем браузере, не передаются третьим лицам.',
    offNote: 'Без функциональных cookie CRM не запомнит ваши настройки между визитами.',
  },
  {
    id: 'analytics',
    title: 'Аналитические',
    description: 'Помогают понять, какими разделами пользуются чаще, чтобы делать сервис удобнее. Сейчас аналитические cookie не используются — мы честно сообщим здесь, если подключим аналитику.',
    offNote: 'Отказ от аналитических cookie никак не ограничивает работу CRM.',
  },
  {
    id: 'marketing',
    title: 'Рекламные',
    description: 'Делают рекламу сервиса релевантнее. Сейчас рекламные cookie не используются — мы не передаём данные рекламным сетям.',
    offNote: 'Отказ от рекламных cookie никак не ограничивает работу CRM.',
  },
];

function SettingsModal({ initial, onClose }: { initial: Consent | null; onClose: () => void }) {
  const [choice, setChoice] = useState({
    functional: initial?.functional === true,
    analytics: initial?.analytics === true,
    marketing: initial?.marketing === true,
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const save = () => { saveConsent(choice); onClose(); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Настройка cookie">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[620px] max-h-[88vh] overflow-y-auto rounded-[20px] border border-line bg-white shadow-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[19px] font-extrabold font-display text-ink">Настройка cookie</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Выберите, какие cookie мы можем использовать. Технические обязательны — без них CRM не работает.
              Мы запомним ваш выбор на год, изменить его можно в любой момент: кнопка «Cookie» есть в боковом меню.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500" aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col divide-y divide-[#f3f4f6]">
          {CATEGORIES.map(cat => {
            const on = cat.locked === true || choice[cat.id as 'functional'];
            return (
              <div key={cat.id} className="py-4">
                <label className={`flex items-center gap-2.5 ${cat.locked ? 'cursor-default' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={on} disabled={cat.locked}
                    onChange={e => setChoice(c => ({ ...c, [cat.id]: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 accent-indigo-600" />
                  <span className="text-[14px] font-bold text-ink">{cat.title}</span>
                </label>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{cat.description}</p>
                {cat.details && (
                  <div className="mt-2 rounded-xl bg-slate-50 border border-line px-3 py-2">
                    {cat.details.map(([name, purpose, ttl]) => (
                      <div key={name} className="py-1 text-[11.5px] leading-relaxed text-muted">
                        <span className="font-mono font-semibold text-ink">{name}</span> — {purpose} · <span className="text-faint">{ttl}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!on && cat.offNote && (
                  <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                    {cat.offNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button onClick={save} className="px-5 h-10 rounded-xl bg-brand-500 text-white text-[13.5px] font-bold hover:bg-brand-600 transition-colors">Сохранить выбор</button>
          <button onClick={() => { saveConsent({ functional: true, analytics: true, marketing: true }); onClose(); }}
            className="px-4 h-10 rounded-xl text-[13px] font-semibold text-[#4b5563] hover:bg-slate-50 transition-colors">Принять все</button>
          <button onClick={() => { saveConsent({ functional: false, analytics: false, marketing: false }); onClose(); }}
            className="px-4 h-10 rounded-xl text-[13px] font-semibold text-[#4b5563] hover:bg-slate-50 transition-colors">Отклонить необязательные</button>
        </div>
        <div className="mt-3 text-[11.5px] text-faint">
          Подробности — в{' '}
          <a href={legalUrl('cookie.html')} target="_blank" rel="noopener" className="underline underline-offset-2 text-muted">Политике в отношении обработки cookie-файлов</a>.
        </div>
      </div>
    </div>
  );
}

export default function CookieConsent() {
  const [consent, setConsent] = useState<Consent | null>(() => getConsent());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(SETTINGS_EVENT, open);
    return () => window.removeEventListener(SETTINGS_EVENT, open);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setConsent(getConsent());
  }, []);

  return (
    <>
      {!consent && !settingsOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] max-w-[720px] w-[calc(100%-32px)] rounded-2xl border border-line bg-white shadow-xl px-5 py-4">
          <div className="text-[14.5px] font-extrabold text-ink">Мы используем cookie, чтобы сделать сервис удобнее</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Технические cookie нужны для работы CRM, остальные — только с вашего согласия.
            Хотите выбрать сами?{' '}
            <button type="button" onClick={() => setSettingsOpen(true)} className="underline underline-offset-2 text-ink font-bold">Настроить cookies</button>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => setConsent(saveConsent({ functional: false, analytics: false, marketing: false }))}
              className="px-4 h-9 rounded-lg border border-line text-[#4b5563] text-[13px] font-semibold hover:bg-slate-50 transition-colors">
              Отклонить
            </button>
            <button onClick={() => setConsent(saveConsent({ functional: true, analytics: true, marketing: true }))}
              className="px-4 h-9 rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-700 transition-colors">
              Принять все cookie
            </button>
          </div>
          <div className="mt-2.5 text-[11px] text-faint">
            <a href={legalUrl('cookie.html')} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-muted">Политика в отношении обработки cookie-файлов</a>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsModal initial={consent} onClose={closeSettings} />}
    </>
  );
}
