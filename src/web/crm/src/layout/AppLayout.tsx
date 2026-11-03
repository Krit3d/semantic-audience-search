import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KanbanSquare, MessageCircle, BarChart3, LifeBuoy, Loader2, LogOut, Search, ChevronRight, CreditCard, Cookie } from 'lucide-react';
import { api, userName, type SubscriptionStatusInfo } from '../services/api';
import { planTitle } from '../screens/pricing/planMeta';
import TrialReminderBanner from '../components/TrialReminderBanner';

export type NavId = 'search' | 'deals' | 'comms' | 'analytics' | 'base' | 'settings' | 'tickets' | 'pricing' | 'support';

const NAV: { id: NavId; label: string; icon: ReactNode }[] = [
  { id: 'search', label: 'Поиск авторов', icon: <Search size={20} strokeWidth={1.8} /> },
  { id: 'deals', label: 'Шорт-лист и сделки', icon: <KanbanSquare size={20} strokeWidth={1.8} /> },
  { id: 'comms', label: 'Коммуникации', icon: <MessageCircle size={20} strokeWidth={1.8} /> },
  { id: 'analytics', label: 'Аналитика', icon: <BarChart3 size={20} strokeWidth={1.8} /> },
];

function SubscriptionNavButton({ active, onNavigate }: { active: boolean; onNavigate: (id: NavId) => void }) {
  const [subscription, setSubscription] = useState<SubscriptionStatusInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const load = useCallback(() => {
    setStatus('loading');
    api.getSubscription()
      .then(item => { setSubscription(item); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') {
    return <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted"><Loader2 size={15} className="animate-spin" />Загружаем подписку…</span>;
  }
  if (status === 'error') {
    return <button type="button" onClick={load} className="h-9 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[12.5px] font-semibold">Ошибка подписки · Повторить</button>;
  }

  const title = subscription?.is_active
    ? subscription.status === 'trial' ? 'Триал' : subscription.plan ? planTitle(subscription.plan.name) : 'Активна'
    : 'Подписка не активна';
  return (
    <button type="button" onClick={() => onNavigate('pricing')} aria-current={active ? 'page' : undefined} title="Тарифы и подписка"
      className="inline-flex items-center h-9 px-1 text-[12.5px] font-medium text-muted hover:text-ink transition-colors">
      {title}
    </button>
  );
}

export function AppLayout({ active, user, isAdmin, onNavigate, onLogout, onNewDeal, children }: {
  active: NavId;
  user: Record<string, unknown> | null;
  isAdmin: boolean;
  onNavigate: (id: NavId) => void;
  onLogout: () => void;
  onNewDeal: () => void;
  children: ReactNode;
}) {
  const name = userName(user) || 'Пользователь';
  const initials = name.split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() || 'CF';

  return (
    <div className="h-screen flex bg-page text-ink overflow-hidden">
      <aside className="w-[240px] shrink-0 bg-white border-r border-line flex flex-col">
        <button type="button" onClick={() => onNavigate('deals')} className="px-5 pt-5 pb-4 flex items-center gap-2.5 text-left" aria-label="Перейти в шорт-лист и сделки">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="#6366f1" stroke="#6366f1" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <div>
            <div className="text-[15px] font-bold font-display text-ink leading-none whitespace-nowrap">Collabrama CRM</div>
            <div className="text-[10px] font-medium text-muted mt-1 leading-tight">CRM для работы с авторами</div>
          </div>
        </button>

        <nav aria-label="Разделы" className="px-3 pt-1 pb-3 flex flex-col gap-1">
          {NAV.map(m => {
            const on = m.id === active;
            return (
              <button key={m.id} type="button" onClick={() => onNavigate(m.id)}
                className={`flex items-center gap-3 px-3.5 h-12 rounded-xl text-[15px] font-semibold transition-colors ${
                  on ? 'bg-brand-50 text-brand-700' : 'text-[#4b5563] hover:bg-slate-50'}`}>
                <span className={on ? 'text-brand-500' : 'text-muted'}>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </nav>

        {isAdmin && (
          <div className="px-3 pb-2">
            <button type="button" onClick={() => onNavigate('tickets')}
              className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-xl text-[13px] font-semibold transition-colors ${
                active === 'tickets' ? 'bg-brand-50 text-brand-700' : 'text-[#4b5563] hover:bg-slate-50'}`}>
              <span className={active === 'tickets' ? 'text-brand-500' : 'text-muted'}><LifeBuoy size={16} /></span>
              Тикеты
            </button>
          </div>
        )}

        <div className="flex-1" />

        <div className="px-3 pb-2 flex flex-col gap-0.5">
          <button type="button" onClick={() => onNavigate('pricing')}
            className={`w-full flex items-center gap-3 px-3.5 h-9 rounded-xl text-[13px] font-semibold transition-colors ${
              active === 'pricing' ? 'bg-brand-50 text-brand-700' : 'text-[#4b5563] hover:bg-slate-50'}`}>
            <span className={active === 'pricing' ? 'text-brand-500' : 'text-muted'}><CreditCard size={16} /></span>Тарифы
          </button>
          <button type="button" onClick={() => onNavigate('support')}
            className={`w-full flex items-center gap-3 px-3.5 h-9 rounded-xl text-[13px] font-semibold transition-colors ${
              active === 'support' ? 'bg-brand-50 text-brand-700' : 'text-[#4b5563] hover:bg-slate-50'}`}>
            <span className={active === 'support' ? 'text-brand-500' : 'text-muted'}><LifeBuoy size={16} /></span>Поддержка
          </button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('cf:cookie-settings'))}
            className="w-full flex items-center gap-3 px-3.5 h-9 rounded-xl text-[13px] font-semibold text-[#4b5563] hover:bg-slate-50 transition-colors">
            <span className="text-muted"><Cookie size={16} /></span>Настройки cookie
          </button>
        </div>

        <div className="mx-3 mb-3 pt-3 border-t border-[#f3f4f6]">
          <button type="button" onClick={() => onNavigate('settings')} aria-current={active === 'settings' ? 'page' : undefined}
            className={`w-full flex items-center gap-3 p-3 rounded-[14px] border transition-colors ${
              active === 'settings' ? 'border-brand-200 bg-brand-50' : 'border-line-soft bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:border-brand-200'}`}>
            <span className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, hsl(255 70% 55%), hsl(285 65% 45%))' }}>
              {initials}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[14px] font-bold text-ink truncate">{name}</span>
              <span className="block mt-0.5 text-[12px] font-medium text-muted">Бренды и база</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-faint" />
          </button>
          <button type="button" onClick={onLogout}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold text-muted hover:text-red-600 hover:bg-red-50 transition-colors">
            <LogOut size={14} />Выйти
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 shrink-0 px-5 bg-white border-b border-line flex items-center justify-end">
          <SubscriptionNavButton active={active === 'pricing'} onNavigate={onNavigate} />
        </div>
        <TrialReminderBanner onOpenPricing={() => onNavigate('pricing')} />
        <main className="flex-1 min-h-0 relative">{children}</main>
      </div>
    </div>
  );
}
