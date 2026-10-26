import type { ReactNode } from 'react';
import { KanbanSquare, MessageCircle, BarChart3, Users, LifeBuoy, LogOut, Search, Plus, ChevronRight, Zap, Globe, CreditCard, Cookie } from 'lucide-react';
import { userName } from '../services/api';

export type NavId = 'deals' | 'comms' | 'analytics' | 'base' | 'settings' | 'tickets' | 'pricing' | 'support';

const SEARCH_HOME = ((import.meta.env.VITE_SEARCH_URL as string | undefined) || 'https://collabrama.ru').replace(/\/+$/, '');

const openCollabramaSearch = (): void => {
  const target = new URL(`${SEARCH_HOME}/`);
  const token = window.localStorage.getItem('creatorflow_token');
  if (token) {
    target.searchParams.set('session_token', token);
    try {
      const raw = window.localStorage.getItem('creatorflow_user');
      const user = raw ? JSON.parse(raw) as { id?: unknown; email?: unknown } : null;
      if (user) {
        if (user.id !== undefined && user.id !== null && String(user.id) !== '') target.searchParams.set('user_id', String(user.id));
        if (typeof user.email === 'string' && user.email) target.searchParams.set('user_email', user.email);
      }
    } catch {
    }
  }
  window.location.href = target.toString();
};

const NAV: { id: NavId; label: string; icon: ReactNode }[] = [
  { id: 'deals', label: 'Шорт-лист и сделки', icon: <KanbanSquare size={20} strokeWidth={1.8} /> },
  { id: 'comms', label: 'Коммуникации', icon: <MessageCircle size={20} strokeWidth={1.8} /> },
  { id: 'analytics', label: 'Аналитика', icon: <BarChart3 size={20} strokeWidth={1.8} /> },
];

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
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="#6366f1" stroke="#6366f1" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <div>
            <div className="text-[15px] font-bold font-display text-ink leading-none">CreatorFlow</div>
            <div className="text-[10px] font-bold text-muted mt-1 tracking-wide uppercase">Influence CRM</div>
          </div>
        </div>

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

        <div className="px-3 pb-3">
          <button type="button" onClick={() => onNavigate('base')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${
              active === 'base' ? 'border-brand-300 bg-brand-50' : 'border-line bg-page hover:border-brand-200'}`}>
            <span className={`w-8 h-8 rounded-[9px] shrink-0 flex items-center justify-center ${
              active === 'base' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'}`}>
              <Users size={16} strokeWidth={1.8} />
            </span>
            <span className="text-[13.5px] font-bold text-ink">Моя база авторов</span>
          </button>
        </div>

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
        <header className="h-[62px] shrink-0 bg-white border-b border-line-soft flex items-center justify-end gap-2 px-6">
          <a href={`${SEARCH_HOME}/landing`} aria-label="Перейти на лендинг" title="О Collabrama — лендинг"
            className="w-11 h-11 box-border rounded-xl border border-[#c7c9f5] bg-white text-brand-500 flex items-center justify-center hover:bg-brand-50 transition-colors">
            <Globe size={18} />
          </a>
          <button type="button" onClick={openCollabramaSearch} aria-label="Поиск авторов" title="Поиск авторов в Collabrama"
            className="w-11 h-11 box-border rounded-xl border border-[#c7c9f5] bg-white text-brand-500 flex items-center justify-center hover:bg-brand-50 transition-colors">
            <Search size={18} />
          </button>
          <button type="button" onClick={() => onNavigate('deals')} aria-label="Шорт-лист и сделки" title="Шорт-лист и сделки"
            className="w-11 h-11 box-border rounded-xl bg-brand-500 text-white flex items-center justify-center shadow-brand-sm hover:bg-brand-600 transition-colors">
            <Zap size={18} />
          </button>
          <button type="button" onClick={onNewDeal}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-brand-500 text-white text-[13.5px] font-bold shadow-brand-sm hover:bg-brand-600 transition-colors active:scale-[.98]">
            <Plus size={16} />Новая сделка
          </button>
        </header>
        <main className="flex-1 min-h-0 relative">{children}</main>
      </div>
    </div>
  );
}
