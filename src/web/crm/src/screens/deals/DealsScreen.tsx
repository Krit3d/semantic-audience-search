import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, LayoutGrid, List, Plus, Send, MessageCircle, Pencil, X, KanbanSquare, Sparkles } from 'lucide-react';
import { STAGES, SHORTLIST_STAGE, fmtMoney, fmtNum, type Deal } from '../../data';
import { useToast } from '../../components/ui';
import { Select, Skeleton, Empty, ErrorState } from '../../components/kit';
import { SocialIcon } from '../../components/icons';
import { api, mapDealItemToDeal, normalizeSocial, type BrandItem, type ShortlistItem } from '../../services/api';

const SEARCH_HOME = (import.meta.env.VITE_SEARCH_URL as string | undefined) || 'https://collabrama.ru/';

const TYPE_STYLE: Record<string, string> = {
  Stories: 'bg-violet-50 text-violet-700 border-violet-200',
  Reels: 'bg-sky-50 text-sky-700 border-sky-200',
  'Пост': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Видео': 'bg-red-50 text-red-700 border-red-200',
};

function hashHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

export function dealNick(d: Deal): string {
  const a = d.authorSummary;
  if (a?.username) return a.username.startsWith('@') ? a.username : `@${a.username}`;
  return a?.title || d.title;
}

export function dealHue(d: Deal): number {
  return hashHue(String(d.authorId));
}

function CardAvatar({ nick, hue, size }: { nick: string; hue: number; size: number }) {
  return (
    <span className="rounded-full shrink-0 flex items-center justify-center font-bold text-white select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${hue + 30} 65% 38%))` }}>
      {nick.replace('@', '').slice(0, 2).toUpperCase()}
    </span>
  );
}

interface ShortCard {
  kind: 'short';
  key: string;
  accountId: string;
  nick: string;
  platform: string;
  subs: number | null;
  er: number | null;
  niche: string | null;
  date: string;
}

interface DealCard {
  kind: 'deal';
  key: string;
  deal: Deal;
}

type KanbanCard = ShortCard | DealCard;

export default function DealsScreen({ deals, dealsStatus, onRetryDeals, setDeals, onOpenDeal, onNewDeal, onOpenComms }: {
  deals: Deal[];
  dealsStatus: 'loading' | 'error' | 'ready';
  onRetryDeals: () => void;
  setDeals: (updater: (prev: Deal[]) => Deal[]) => void;
  onOpenDeal: (id: string, tab?: string) => void;
  onNewDeal: () => void;
  onOpenComms: (authorId: string) => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [query, setQuery] = useState('');
  const [fBrand, setFBrand] = useState('all');
  const [fStage, setFStage] = useState('all');
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [shortlist, setShortlist] = useState<ShortlistItem[] | null>(null);
  const [shortError, setShortError] = useState(false);
  const [drag, setDrag] = useState<KanbanCard | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadShortlist = () => {
    setShortError(false);
    api.getShortlist()
      .then(items => setShortlist(items))
      .catch(() => { setShortlist([]); setShortError(true); });
  };

  useEffect(() => {
    loadShortlist();
    api.getBrands().then(setBrands).catch(() => setBrands([]));
  }, []);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const showUndo = (text: string, run: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ text, run });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter(d => {
      if (fBrand !== 'all' && d.brandId !== fBrand) return false;
      if (fStage !== 'all' && d.stage !== Number(fStage)) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || dealNick(d).toLowerCase().includes(q) || d.brandId.toLowerCase().includes(q);
    });
  }, [deals, query, fBrand, fStage]);

  const shortCards: ShortCard[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (shortlist ?? [])
      .filter(item => {
        if (fStage !== 'all' && fStage !== String(SHORTLIST_STAGE)) return false;
        const nick = item.author?.username ? `@${item.author.username.replace(/^@/, '')}` : (item.author?.title ?? item.account_id);
        if (q && !nick.toLowerCase().includes(q)) return false;
        return true;
      })
      .map(item => ({
        kind: 'short' as const,
        key: `s${item.account_id}`,
        accountId: item.account_id,
        nick: item.author?.username ? `@${item.author.username.replace(/^@/, '')}` : (item.author?.title ?? `@${item.account_id}`),
        platform: item.author?.platform ?? 'telegram',
        subs: item.author?.subscribers_count ?? null,
        er: item.author?.static_avg_er ?? null,
        niche: item.author?.category_path ?? null,
        date: new Date(item.added_at).toLocaleDateString('ru-RU'),
      }));
  }, [shortlist, query, fStage]);

  const stage7Deals = filteredDeals.filter(d => d.stage === SHORTLIST_STAGE);
  const activeDeals = filteredDeals.filter(d => d.stage >= 1 && d.stage <= 6);
  const budgetTotal = activeDeals.reduce((sum, d) => sum + d.budget, 0);

  const brandOpts = [{ v: 'all', label: 'Все бренды' }, ...brands.map(b => ({ v: b.name, label: b.name }))];
  const stageOpts = [{ v: 'all', label: 'Все этапы' }, ...STAGES.map(s => ({ v: String(s.id), label: s.name }))];

  const removeShort = (card: ShortCard) => {
    const backup = shortlist ?? [];
    setShortlist(prev => (prev ?? []).filter(x => x.account_id !== card.accountId));
    showUndo(`${card.nick} удалён из шорт-листа`, () => {
      api.exportShortlist([card.accountId])
        .then(() => loadShortlist())
        .catch(() => { setShortlist(backup); toast('err', 'Не удалось вернуть автора'); });
    });
    api.removeFromShortlist(card.accountId).catch(() => {
      setShortlist(backup);
      setUndo(null);
      toast('err', 'Не удалось удалить автора из шорт-листа');
    });
  };

  const removeDeal = (deal: Deal) => {
    const backup = deals;
    setDeals(prev => prev.filter(d => d.id !== deal.id));
    let cancelled = false;
    const deleteTimer = setTimeout(() => {
      if (cancelled) return;
      api.deleteDeal(Number(deal.id)).catch(() => {
        setDeals(() => backup);
        toast('err', 'Не удалось удалить сделку');
      });
    }, 5500);
    showUndo(`Сделка «${deal.title}» удалена`, () => {
      cancelled = true;
      clearTimeout(deleteTimer);
      setDeals(() => backup);
    });
  };

  const moveDeal = (deal: Deal, stage: number) => {
    if (deal.stage === stage) return;
    const backup = deals;
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage } : d));
    api.updateDeal(Number(deal.id), { stage })
      .then(() => toast('ok', `Сделка перемещена в «${STAGES.find(s => s.id === stage)?.name ?? stage}»`))
      .catch(() => { setDeals(() => backup); toast('err', 'Ошибка при обновлении стадии'); });
  };

  const shortToStage = (card: ShortCard, stage: number) => {
    api.createDeal({
      account_id: card.accountId,
      title: `${card.nick} · интеграция`,
      budget: 0,
      type: 'Пост',
    })
      .then(item => {
        const apply = (stageValue: number) => stageValue === 1
          ? Promise.resolve(item)
          : api.updateDeal(item.id, { stage: stageValue });
        return apply(stage);
      })
      .then(finalItem => {
        setDeals(prev => [mapDealItemToDeal(finalItem), ...prev.filter(d => d.id !== String(finalItem.id))]);
        return api.removeFromShortlist(card.accountId).catch(() => undefined);
      })
      .then(() => {
        loadShortlist();
        toast('ok', `${card.nick} перенесён в сделки`);
      })
      .catch(() => toast('err', 'Не удалось создать сделку'));
  };

  const dropOn = (stageId: number) => {
    const card = drag;
    setDrag(null);
    setOverCol(null);
    if (!card) return;
    if (card.kind === 'deal') moveDeal(card.deal, stageId);
    else if (stageId !== SHORTLIST_STAGE) shortToStage(card, stageId);
  };

  const findSimilar = () => {
    const ids = (shortlist ?? []).map(x => x.account_id);
    if (!ids.length) {
      toast('info', 'Шорт-лист пуст — добавьте авторов из поиска');
      return;
    }
    const target = new URL(SEARCH_HOME);
    target.searchParams.set('similar', ids.slice(0, 50).join(','));
    target.searchParams.set('from', 'crm');
    const token = api.getToken();
    if (token) target.searchParams.set('session_token', token);
    const user = api.getCurrentUser();
    if (user?.id !== undefined && user?.id !== null) target.searchParams.set('user_id', String(user.id));
    if (typeof user?.email === 'string') target.searchParams.set('user_email', user.email);
    window.location.href = target.toString();
  };

  const renderShortCard = (card: ShortCard) => {
    const hue = hashHue(card.accountId);
    return (
      <article key={card.key} draggable
        onDragStart={e => { setDrag(card); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDrag(null); setOverCol(null); }}
        title="Перетащите на другой этап"
        className={`relative bg-white rounded-xl border border-gray-200/80 p-3 cursor-grab active:cursor-grabbing shadow-[0_1px_2px_rgba(16,24,40,.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,.25)] hover:border-brand-200 ${drag?.key === card.key ? 'dragging-card' : ''}`}>
        <div className="flex items-center gap-2">
          <CardAvatar nick={card.nick} hue={hue} size={26} />
          <span className="text-[12px] font-bold text-gray-800 truncate">{card.nick}</span>
          <SocialIcon social={normalizeSocial(card.platform)} size={13} className="shrink-0" />
          <button type="button" onClick={() => removeShort(card)} aria-label={`Убрать ${card.nick} из шорт-листа`} title="Убрать из шорт-листа"
            className="ml-auto shrink-0 w-6 h-6 -my-1 border-0 rounded-md bg-transparent text-gray-300 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="text-[13px] font-semibold text-ink leading-snug mt-2 line-clamp-2">{card.nick}</div>
        <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] font-semibold text-[#4b5563]">
          {card.subs !== null && <span className="px-1.5 py-0.5 rounded-md bg-gray-100">{fmtNum(card.subs)}</span>}
          {card.er !== null && <span className="px-1.5 py-0.5 rounded-md bg-gray-100">ER {card.er}%</span>}
          {card.niche && <span className="px-1.5 py-0.5 rounded-md bg-gray-100 truncate max-w-full">{card.niche.split('/').pop()}</span>}
        </div>
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => onOpenComms(card.accountId)}
            className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-[12px] font-bold hover:bg-brand-100 transition-colors">
            <Send size={13} />Написать
          </button>
          <span className="ml-auto text-[11px] font-semibold text-muted">{card.date}</span>
        </div>
      </article>
    );
  };

  const renderDealCard = (d: Deal) => {
    const nick = dealNick(d);
    const hue = dealHue(d);
    const stage = STAGES.find(s => s.id === d.stage);
    return (
      <article key={`d${d.id}`} draggable
        onDragStart={e => { setDrag({ kind: 'deal', key: `d${d.id}`, deal: d }); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDrag(null); setOverCol(null); }}
        title="Перетащите на другой этап"
        className={`relative bg-white rounded-xl border border-gray-200/80 p-3 pl-3.5 cursor-grab active:cursor-grabbing shadow-[0_1px_2px_rgba(16,24,40,.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,.25)] hover:border-brand-200 ${drag?.key === `d${d.id}` ? 'dragging-card' : ''}`}>
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: stage?.color ?? '#94A3B8' }} />
        <div className="flex items-center gap-2">
          <CardAvatar nick={nick} hue={hue} size={26} />
          <span className="text-[12px] font-bold text-gray-800 truncate">{nick}</span>
          <SocialIcon social={normalizeSocial(d.authorSummary?.platform)} size={13} className="shrink-0" />
          <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${TYPE_STYLE[d.type] ?? TYPE_STYLE['Пост']}`}>{d.type}</span>
          <button type="button" onClick={() => onOpenDeal(d.id)} aria-label={`Редактировать ${nick}`} title="Редактировать"
            className="shrink-0 w-6 h-6 -my-1 border-0 rounded-md bg-transparent text-gray-300 flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-colors">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => removeDeal(d)} aria-label={`Удалить сделку ${nick}`} title="Удалить сделку"
            className="shrink-0 w-6 h-6 -my-1 -mr-1 border-0 rounded-md bg-transparent text-gray-300 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="text-[13px] font-semibold text-ink leading-snug mt-2 line-clamp-2 cursor-pointer" onClick={() => onOpenDeal(d.id)}>{d.title}</div>
        <div className="text-[14px] font-extrabold text-ink mt-1.5 tabular-nums">{fmtMoney(d.budget)}</div>
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => onOpenComms(String(d.authorId))}
            className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-[12px] font-bold hover:bg-brand-100 transition-colors">
            <Send size={13} />Написать
          </button>
          <button type="button" onClick={() => onOpenComms(String(d.authorId))} title="Сообщения — открыть в Коммуникациях"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-brand-600 transition-colors">
            <MessageCircle size={13} />{d.msgs.length}
          </button>
          <span className="ml-auto text-[11px] font-semibold text-muted">{d.date}</span>
        </div>
        {d.erid && (
          <span className="absolute -top-[9px] right-2 text-[11px] font-semibold px-2 py-[1px] rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">ERID ✓</span>
        )}
      </article>
    );
  };

  const kanbanColumn = (stageId: number, name: string, color: string, cards: KanbanCard[]) => (
    <section key={stageId}
      onDragOver={e => { e.preventDefault(); setOverCol(stageId); }}
      onDragLeave={() => setOverCol(c => (c === stageId ? null : c))}
      onDrop={() => dropOn(stageId)}
      className={`w-[264px] shrink-0 rounded-xl border bg-slate-50/80 flex flex-col transition-colors ${overCol === stageId ? 'drop-target border-brand-300' : 'border-gray-200/70'}`}>
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[12.5px] font-bold text-gray-700">{name}</span>
        {stageId === SHORTLIST_STAGE && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded px-1 py-0.5">этап 0</span>}
        <span className="ml-auto text-[11px] font-extrabold text-muted bg-white border border-line rounded-md px-1.5 py-0.5 tabular-nums">{cards.length}</span>
      </div>
      {stageId === SHORTLIST_STAGE && (
        <div className="px-2 pb-2 flex flex-col gap-2">
          <button type="button" onClick={onNewDeal}
            className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 bg-white text-slate-600 text-[12px] font-semibold hover:border-brand-300 hover:text-brand-600 transition-colors">
            <Plus size={13} />Сделка вручную
          </button>
          <button type="button" onClick={findSimilar}
            className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[12px] font-bold hover:bg-violet-100 transition-colors">
            <Sparkles size={13} />Найти похожих
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-2 pb-2 flex flex-col gap-2">
        {cards.map(c => c.kind === 'short' ? renderShortCard(c) : renderDealCard(c.deal))}
        {cards.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-6 text-gray-300">
            <KanbanSquare size={22} className="mb-2" />
            <div className="text-[11.5px] font-semibold">Перетащите сюда</div>
          </div>
        )}
      </div>
    </section>
  );

  const listRows: KanbanCard[] = [
    ...shortCards,
    ...filteredDeals.map(d => ({ kind: 'deal' as const, key: `d${d.id}`, deal: d })),
  ];

  const loading = dealsStatus === 'loading' || shortlist === null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5 pb-3 shrink-0 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-display font-semibold text-ink">Сделки</h1>
          <p className="text-[12.5px] font-medium text-muted mt-1">
            {shortCards.length + stage7Deals.length} в шорт-листе · {activeDeals.length} сделок на {fmtMoney(budgetTotal)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 w-[260px] h-9 box-border px-3 rounded-lg border border-line bg-white text-muted focus-within:border-brand-300 transition-colors">
            <Search size={14} />
            <span className="sr-only">Поиск по сделкам</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по сделкам: автор, бренд…"
              className="flex-1 min-w-0 border-0 outline-none bg-transparent text-[12.5px] text-ink placeholder:text-faint" />
          </label>
          <div role="group" aria-label="Вид" className="flex p-[3px] rounded-[10px] bg-[#eef0f4] gap-0.5">
            <button type="button" onClick={() => setView('kanban')} aria-pressed={view === 'kanban'}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-lg text-[12.5px] transition-colors ${view === 'kanban' ? 'bg-white text-ink font-bold shadow-sm' : 'text-muted font-semibold'}`}>
              <LayoutGrid size={14} />Канбан
            </button>
            <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-lg text-[12.5px] transition-colors ${view === 'list' ? 'bg-white text-ink font-bold shadow-sm' : 'text-muted font-semibold'}`}>
              <List size={14} />Список
            </button>
          </div>
          <Select options={brandOpts} value={fBrand} onChange={setFBrand} label="Бренд" width={170} />
          <Select options={stageOpts} value={fStage} onChange={setFStage} label="Этап" width={200} />
        </div>
      </div>

      {shortError && (
        <div className="mx-6 mb-2 flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[12.5px] font-semibold text-red-700">
          Не удалось загрузить шорт-лист
          <button type="button" onClick={loadShortlist} className="underline hover:text-red-800">Повторить</button>
        </div>
      )}

      {dealsStatus === 'error' && (
        <ErrorState className="flex-1" message="Не удалось загрузить сделки. Проверьте соединение и попробуйте снова." onRetry={onRetryDeals} />
      )}

      {dealsStatus !== 'error' && loading && (
        <div className="flex-1 min-h-0 px-6 pb-4">
          <div className="flex gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="w-[264px] shrink-0 rounded-xl border border-gray-200/70 bg-slate-50/80 p-3 flex flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ))}
          </div>
        </div>
      )}

      {dealsStatus !== 'error' && !loading && view === 'kanban' && (
        <div className="flex-1 min-h-0 overflow-x-auto scroll-thin px-4 pb-4 pt-1">
          <div className="flex gap-3 h-full w-max min-w-full">
            {kanbanColumn(SHORTLIST_STAGE, 'Шорт-лист', '#8B5CF6', [...shortCards, ...stage7Deals.map(d => ({ kind: 'deal' as const, key: `d${d.id}`, deal: d }))])}
            {STAGES.filter(s => s.id !== SHORTLIST_STAGE).map(s =>
              kanbanColumn(s.id, s.name, s.color, filteredDeals.filter(d => d.stage === s.id).map(d => ({ kind: 'deal' as const, key: `d${d.id}`, deal: d })))
            )}
          </div>
        </div>
      )}

      {dealsStatus !== 'error' && !loading && view === 'list' && (
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-6 pb-4 pt-1">
          {listRows.length === 0 ? (
            <Empty icon={<KanbanSquare size={22} />} title="Ничего не найдено"
              text={query || fBrand !== 'all' || fStage !== 'all' ? 'Попробуйте изменить фильтры или поисковый запрос.' : 'Создайте первую сделку или добавьте авторов из поиска.'} />
          ) : (
            <div className="bg-white border border-line rounded-xl overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] font-bold text-muted uppercase tracking-wide bg-page border-b border-slate-100">
                    <th className="px-4 py-2.5">Сделка</th>
                    <th className="px-3 py-2.5">Автор</th>
                    <th className="px-3 py-2.5">Этап</th>
                    <th className="px-3 py-2.5">Тип</th>
                    <th className="px-3 py-2.5 text-right">Бюджет</th>
                    <th className="px-3 py-2.5">Обновлено</th>
                    <th className="px-4 py-2.5 text-right">Диалог</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map(row => row.kind === 'short' ? (
                    <tr key={row.key} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-ink">{row.nick}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <CardAvatar nick={row.nick} hue={hashHue(row.accountId)} size={24} />
                          <span className="font-bold text-body">{row.nick}</span>
                          <SocialIcon social={normalizeSocial(row.platform)} size={13} />
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2 py-0.5 rounded-md border bg-violet-50 text-violet-700 border-violet-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />Шорт-лист
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-faint">—</td>
                      <td className="px-3 py-2.5 text-right text-faint">—</td>
                      <td className="px-3 py-2.5 text-muted font-semibold">{row.date}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => onOpenComms(row.accountId)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700 transition-colors align-middle">
                          <Send size={13} />Написать
                        </button>
                        <button type="button" onClick={() => removeShort(row)} title="Убрать из шорт-листа"
                          className="ml-1.5 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-line bg-white text-muted text-[12px] font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors align-middle">
                          <X size={12} />Убрать
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.key} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-ink">
                        {row.deal.title}
                        {row.deal.erid && <span className="ml-2 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">ERID</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <CardAvatar nick={dealNick(row.deal)} hue={dealHue(row.deal)} size={24} />
                          <span className="font-bold text-body">{dealNick(row.deal)}</span>
                          <SocialIcon social={normalizeSocial(row.deal.authorSummary?.platform)} size={13} />
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => { const st = STAGES.find(s => s.id === row.deal.stage); return (
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2 py-0.5 rounded-md border" style={{ background: st?.soft, color: st?.color, borderColor: st?.color + '33' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st?.color }} />{st?.name ?? row.deal.stage}
                          </span>
                        ); })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-md border ${TYPE_STYLE[row.deal.type] ?? TYPE_STYLE['Пост']}`}>{row.deal.type}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{fmtMoney(row.deal.budget)}</td>
                      <td className="px-3 py-2.5 text-muted font-semibold">{row.deal.date}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => onOpenComms(String(row.deal.authorId))} title="Сообщения — открыть в Коммуникациях"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-brand-600 transition-colors align-middle mr-2">
                          <MessageCircle size={13} />{row.deal.msgs.length}
                        </button>
                        <button type="button" onClick={() => onOpenComms(String(row.deal.authorId))}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700 transition-colors align-middle">
                          <Send size={13} />Написать
                        </button>
                        <button type="button" onClick={() => onOpenDeal(row.deal.id)} title="Редактировать"
                          className="ml-1.5 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line bg-white text-muted hover:bg-brand-50 hover:text-brand-600 transition-colors align-middle">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => removeDeal(row.deal)} title="Удалить сделку"
                          className="ml-1.5 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-line bg-white text-muted text-[12px] font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors align-middle">
                          <X size={12} />Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dealsStatus !== 'error' && !loading && view === 'kanban' && filteredDeals.length === 0 && shortCards.length === 0 && (
        <div className="absolute inset-x-0 bottom-6 pointer-events-none flex justify-center">
          <div className="pointer-events-auto">
            <Empty icon={<KanbanSquare size={22} />} title="Пока пусто"
              text="Добавьте авторов из поиска Collabrama — они появятся в шорт-листе, или создайте сделку вручную." />
          </div>
        </div>
      )}

      {undo && createPortal(
        <div role="status" className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[110] flex items-center gap-3.5 pl-4 pr-2.5 py-2.5 rounded-xl bg-gray-900 text-white shadow-2xl toast-in">
          <span className="text-[13px] font-semibold">{undo.text}</span>
          <button type="button" onClick={() => { undo.run(); setUndo(null); }}
            className="h-8 px-3 rounded-lg bg-white/10 text-brand-200 text-[12.5px] font-bold hover:bg-white/20 transition-colors">Вернуть</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
