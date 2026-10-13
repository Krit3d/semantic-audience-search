import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Search, X } from 'lucide-react';
import { STAGES, fmtMoney, fmtNum, hashHue, resolveAuthor, type Deal } from './data';
import { ToastProvider, useToast, Avatar, Btn, Modal, Field, inputCls } from './components/ui';
import LoginModal from './components/LoginModal';
import { api, mapDealItemToDeal, type CreatorRecord } from './services/api';
import { brandLetter, findBrand, useBrands } from './services/brands';
import { AppLayout, type NavId } from './layout/AppLayout';
import DealPanel from './screens/DealPanel';
import DealsScreen from './screens/deals/DealsScreen';
import BrandEditorScreen from './screens/settings/BrandEditorScreen';
import Authors from './screens/Authors';
import AuthorProfile from './screens/AuthorProfile';
import ContractWizard from './screens/ContractWizard';
import SettingsScreen from './screens/settings/SettingsScreen';
import AnalyticsScreen from './screens/analytics/AnalyticsScreen';
import Tickets from './screens/Tickets';
import CommsScreen from './screens/comms/CommsScreen';

type Screen = 'kanban' | 'deals' | 'authors' | 'author' | 'comms' | 'settings' | 'brand' | 'analytics' | 'tickets';

const SCREENS: Screen[] = ['kanban', 'deals', 'authors', 'author', 'comms', 'settings', 'brand', 'analytics', 'tickets'];

const screenFromHash = (): Screen => {
  let seg = window.location.hash;
  if (seg.startsWith('#')) seg = seg.slice(1);
  if (seg.startsWith('/')) seg = seg.slice(1);
  const path = seg.split('?')[0];
  if (/^settings\/brands\/\d+/.test(path)) return 'brand';
  return SCREENS.includes(path as Screen) ? (path as Screen) : 'authors';
};

const brandIdFromHash = (): number | null => {
  let seg = window.location.hash;
  if (seg.startsWith('#')) seg = seg.slice(1);
  if (seg.startsWith('/')) seg = seg.slice(1);
  const match = seg.split('?')[0].match(/^settings\/brands\/(\d+)/);
  return match ? Number(match[1]) : null;
};

const consumeInboundSession = (): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  const hashParams = new URLSearchParams(q !== -1 ? hash.slice(q + 1) : '');
  const token = searchParams.get('session_token') ?? hashParams.get('session_token');
  if (!token) return;
  const userId = searchParams.get('user_id') ?? hashParams.get('user_id') ?? '';
  const userEmail = searchParams.get('user_email') ?? hashParams.get('user_email') ?? '';
  api.saveSession(token, { id: userId, email: userEmail });
  for (const key of ['session_token', 'user_id', 'user_email']) {
    searchParams.delete(key);
    hashParams.delete(key);
  }
  const search = searchParams.toString();
  const hashPath = q !== -1 ? hash.slice(0, q) : hash;
  const hashQuery = hashParams.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${hashPath}${hashQuery ? `?${hashQuery}` : ''}`);
};

const getRedirectTarget = (): string | null => {
  const fromSearch = new URLSearchParams(window.location.search).get('redirect');
  if (fromSearch) return fromSearch;
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  if (q !== -1) {
    const fromHash = new URLSearchParams(hash.slice(q + 1)).get('redirect');
    if (fromHash) return fromHash;
  }
  return null;
};

const buildRedirectUrl = (redirectTarget: string, token: string, user: Record<string, unknown> | null): string => {
  const target = new URL(redirectTarget, window.location.origin);
  target.searchParams.set('session_token', token);
  const userId = user?.id;
  if (userId !== undefined && userId !== null) target.searchParams.set('user_id', String(userId));
  const userEmail = user?.email;
  if (userEmail !== undefined && userEmail !== null) target.searchParams.set('user_email', String(userEmail));
  return target.toString();
};

const dealIdFromHash = (): string | null => {
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  if (q !== -1) {
    const fromHash = new URLSearchParams(hash.slice(q + 1)).get('dealId');
    if (fromHash) return fromHash;
  }
  return new URLSearchParams(window.location.search).get('dealId');
};

const NAV_BY_SCREEN: Record<Screen, NavId> = {
  kanban: 'deals', deals: 'deals', comms: 'comms', analytics: 'analytics',
  authors: 'base', author: 'base', settings: 'settings', brand: 'settings', tickets: 'tickets',
};

const HASH_BY_NAV: Record<NavId, Screen> = {
  deals: 'kanban', comms: 'comms', analytics: 'analytics', base: 'authors', settings: 'settings', tickets: 'tickets',
};

function Shell({ user, onLogout }: { user: Record<string, unknown> | null; onLogout: () => void }) {
  const toast = useToast();
  const isAdmin = user?.is_admin === true;
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsStatus, setDealsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const loadDeals = () => {
    setDealsStatus('loading');
    api.getDeals()
      .then(items => { setDeals(items.map(mapDealItemToDeal)); setDealsStatus('ready'); })
      .catch(() => { setDealsStatus('error'); toast('err', 'Не удалось загрузить сделки'); });
  };
  const [dealId, setDealId] = useState<string | null>(null);
  const [dealTab, setDealTab] = useState<string | undefined>(undefined);
  const [wizardDeal, setWizardDeal] = useState<Deal | null>(null);
  const [newDeal, setNewDeal] = useState<null | { authorId?: string; authorName?: string; authorHandle?: string }>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [brandEditorId, setBrandEditorId] = useState<number | null>(brandIdFromHash);
  const [profileId, setProfileId] = useState<string>('a1');
  const [commsAuthorId, setCommsAuthorId] = useState<string | null>(null);

  const handleNavigate = (id: NavId) => {
    const target = HASH_BY_NAV[id];
    if (target === 'tickets' && !isAdmin) return;
    window.location.hash = '#/' + target;
    setScreen(target);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(o => !o); }
      if (e.key === 'Escape') { setSearchOpen(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = screenFromHash();
      if (window.location.hash === '' || window.location.hash === '#' || window.location.hash === '#/') {
        window.location.hash = '#/authors';
      }
      setBrandEditorId(brandIdFromHash());
      setScreen(next);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    loadDeals();
  }, []);

  useEffect(() => {
    const id = dealIdFromHash();
    if (id && deals.some(d => d.id === id)) setDealId(id);
  }, [deals]);

  const openDeal = (id: string, tab?: string) => {
    setDealTab(tab);
    setDealId(id);
    const path = window.location.hash.split('?')[0] || '#/deals';
    window.location.hash = `${path}?dealId=${id}`;
  };
  const handleAuthorChat = (authorId: string) => {
    setCommsAuthorId(authorId);
    setScreen('comms');
    window.location.hash = '#/comms';
  };
  const deal = dealId ? deals.find(d => d.id === dealId) ?? null : null;
  const openBrandEditor = (brandId: number) => { setDealId(null); window.location.hash = `#/settings/brands/${brandId}`; };
  const openKB = (brandKey?: string) => {
    setDealId(null);
    if (!brandKey) { window.location.hash = '#/settings'; return; }
    api.getBrands()
      .then(list => {
        const found = list.find(b => String(b.id) === brandKey || b.name === brandKey);
        window.location.hash = found ? `#/settings/brands/${found.id}` : '#/settings';
      })
      .catch(() => { window.location.hash = '#/settings'; });
  };

  return (
    <AppLayout active={NAV_BY_SCREEN[screen]} user={user} isAdmin={isAdmin} onNavigate={handleNavigate}
      onLogout={onLogout} onNewDeal={() => setNewDeal({})}>
      {(screen === 'kanban' || screen === 'deals') && <DealsScreen deals={deals} dealsStatus={dealsStatus} onRetryDeals={loadDeals} setDeals={setDeals} onOpenDeal={openDeal} onNewDeal={() => setNewDeal({})} onOpenComms={(authorId: string) => handleAuthorChat(String(authorId))} />}
      {screen === 'authors' && <Authors deals={deals} onOpenProfile={id => { setProfileId(id); setScreen('author'); }} onNewDeal={(id, meta) => setNewDeal({ authorId: id, authorName: meta?.name, authorHandle: meta?.handle })} onOpenComms={(authorId: string) => handleAuthorChat(String(authorId))} />}
      {screen === 'author' && <AuthorProfile authorId={profileId} deals={deals} onBack={() => setScreen('authors')} onNewDeal={(id, meta) => setNewDeal({ authorId: id, authorName: meta?.name, authorHandle: meta?.handle })} onOpenDeal={(id, tab) => openDeal(id, tab ?? 'comms')} onOpenComms={(id?: string) => handleAuthorChat(id ? String(id) : String(profileId))} />}
      {screen === 'comms' && <CommsScreen deals={deals} initialAuthorId={commsAuthorId} onOpenDeal={openDeal} onNewDeal={(id, meta) => setNewDeal({ authorId: id, authorName: meta?.name, authorHandle: meta?.handle })} />}
      {screen === 'settings' && <SettingsScreen user={user} onOpenBrand={openBrandEditor} />}
      {screen === 'brand' && brandEditorId !== null && <BrandEditorScreen brandId={brandEditorId} key={brandEditorId} onClose={() => { window.location.hash = '#/settings'; }} onOpenRegistry={() => { window.location.hash = '#/settings'; }} />}
      {screen === 'analytics' && <AnalyticsScreen />}
      {screen === 'tickets' && (isAdmin ? <Tickets /> : (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-[40px] font-extrabold font-display text-gray-200">403</div>
            <div className="text-[13px] font-semibold text-gray-400 mt-1">Доступ разрешён только администраторам</div>
          </div>
        </div>
      ))}

      {/* ===== Оверлеи ===== */}
      {deal && (
        <DealPanel deal={deal} deals={deals} initialTab={dealTab} key={deal.id + (dealTab ?? '')} onClose={() => {
          setDealId(null);
          const path = window.location.hash.split('?')[0];
          window.location.hash = path;
        }}
          onUpdate={patch => setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, ...patch } : d))}
          onOpenKB={openKB}
          onOpenAuthor={(authorId: string) => {
            setProfileId(authorId);
            setScreen('author');
            setDealId(null);
            window.location.hash = '#/author';
          }}
          onOpenComms={(authorId: string) => {
            setDealId(null);
            handleAuthorChat(String(authorId));
          }}
          onGenerateContract={d => { setDealId(null); setWizardDeal(d); }}
          onDelete={deletedId => {
            setDeals(prev => prev.filter(d => d.id !== deletedId));
            setDealId(null);
            toast('ok', 'Сделка успешно удалена');
          }} />
      )}
      {wizardDeal && <ContractWizard deal={wizardDeal} onClose={() => setWizardDeal(null)} onDone={() => setWizardDeal(null)} />}
      {newDeal && <NewDealModal initialAuthor={newDeal.authorId} initialAuthorMeta={{ name: newDeal.authorName, handle: newDeal.authorHandle }} onClose={() => setNewDeal(null)} onCreate={d => {
        setDeals(prev => [d, ...prev]);
        setNewDeal(null);
        setScreen('kanban');
        setDealId(d.id);
        toast('ok', `Сделка «${d.title}» создана в воронке`);
      }} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} deals={deals}
        onPick={(kind, id) => {
          setSearchOpen(false);
          if (kind === 'deal') { setScreen('kanban'); setDealId(id); }
          if (kind === 'author') { setProfileId(id); setScreen('author'); }
          if (kind === 'brand') openKB(id);
        }} />}
    </AppLayout>
  );
}

/* ===== Модальное окно «Новая сделка» ===== */
const getDefaultPubDate = (daysAhead: number = 14): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
};

const buildAuthorOptions = (records: CreatorRecord[]): { id: string; label: string; handle: string }[] => {
  return records.flatMap(c => {
    const rawId = String(c.accountid ?? c.accountId ?? c.id ?? '').trim();
    if (!rawId || rawId === 'undefined' || rawId === 'null') return [];
    const rawHandle = c.handle ?? c.username;
    const handle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '';
    const label = handle
      ? `${handle}${c.name ? ` (${c.name.slice(0, 30)})` : ''}`
      : (c.name ?? 'Автор без имени');
    return [{ id: rawId, label, handle }];
  });
};

function NewDealModal({ initialAuthor, initialAuthorMeta, onClose, onCreate }: { initialAuthor?: string; initialAuthorMeta?: { name?: string; handle?: string }; onClose: () => void; onCreate: (d: Deal) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [creators, setCreators] = useState<CreatorRecord[]>([]);
  const [extraAuthorOption, setExtraAuthorOption] = useState<{ id: string; label: string; handle: string } | null>(null);
  const initId = initialAuthor ? String(initialAuthor).trim() : '';
  const [authorId, setAuthorId] = useState(initId);
  const [brandId, setBrandId] = useState('');
  const [budget, setBudget] = useState('50000');
  const [type, setType] = useState<Deal['type']>('Stories');
  const [pubDate, setPubDate] = useState(getDefaultPubDate(14));
  const [customBrand, setCustomBrand] = useState('');
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const brands = useBrands();
  const foundBrand = findBrand(brands, brandId);
  const defaultPayLabel = foundBrand?.kb?.pay_types?.find(p => p.def)?.label ?? 'Фиксированная оплата';
  const finalBrandName = isCustomBrand ? (customBrand.trim() || 'Свой бренд') : (foundBrand?.name ?? '');

  useEffect(() => {
    if (!brandId && brands.length > 0) setBrandId(String(brands[0].id));
  }, [brands, brandId]);

  useEffect(() => {
    api.getCreators()
      .then(records => {
        setCreators(records);
        if (initialAuthor) {
          const match = records.find(c => String(c.accountid ?? c.accountId ?? '') === String(initialAuthor) || String(c.id ?? '') === String(initialAuthor));
          if (match) {
            const rawHandle = match.handle ?? match.username;
            const handle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '';
            const name = match.name ?? match.Name ?? '';
            setExtraAuthorOption({
              id: String(initialAuthor).trim(),
              label: handle ? `${handle} (${name || 'Автор'})` : (name || 'Автор'),
              handle,
            });
          }
        }
        if (!initId && !authorId) {
          const options = buildAuthorOptions(records);
          if (options.length > 0) {
            setAuthorId(options[0].id);
          }
        }
      })
      .catch(() => toast('err', 'Не удалось загрузить авторов'));
  }, []);

  useEffect(() => {
    if (!initialAuthor) return;
    api.getCreatorProfile(String(initialAuthor))
      .then(profile => {
        const handle = profile.username ? (profile.username.startsWith('@') ? profile.username : `@${profile.username}`) : `@${profile.title}`;
        const label = `${handle} (${profile.title || 'Автор'})`;
        setExtraAuthorOption({ id: String(initialAuthor).trim(), label, handle });
      })
      .catch(() => {});
  }, [initialAuthor]);

  const initialOption = initialAuthor
    ? {
        id: String(initialAuthor).trim(),
        label: initialAuthorMeta?.handle ? `${initialAuthorMeta.handle} (${initialAuthorMeta.name || 'Автор'})` : (initialAuthorMeta?.name || 'Автор'),
        handle: initialAuthorMeta?.handle || '',
      }
    : null;
  const baseOptions = buildAuthorOptions(creators);
  const mergedOptions = [extraAuthorOption, initialOption]
    .filter((o): o is { id: string; label: string; handle: string } => o !== null)
    .reduce((acc, o) => (acc.some(x => x.id === o.id) ? acc : [o, ...acc]), baseOptions);
  const authorOptions = authorId && !mergedOptions.some(o => o.id === authorId)
    ? [{ id: authorId, label: initialOption?.label ?? 'Автор', handle: initialOption?.handle ?? '' }, ...mergedOptions]
    : mergedOptions;
  const currentOption = authorOptions.find(o => o.id === authorId);
  const fallbackTitle = `${finalBrandName} · ${type} · ${currentOption?.handle || currentOption?.label || 'Автор'}`.slice(0, 250);

  const create = async () => {
    if (!authorId.trim()) {
      toast('err', 'Выберите автора');
      return;
    }
    try {
      const item = await api.createDeal({
        account_id: authorId.trim(),
        title: title.trim() ? title.trim().slice(0, 250) : fallbackTitle,
        budget: Number(budget) || 0,
        type,
        brand_name: finalBrandName,
        pub_date: pubDate,
        terms: `${defaultPayLabel} ${budget} ₽`,
      });
      onCreate(mapDealItemToDeal(item));
    } catch {
      toast('err', 'Не удалось создать сделку');
    }
  };

  return (
    <Modal onClose={onClose} w="max-w-[520px]">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center">
        <h2 className="text-[15.5px] font-bold text-gray-900">Новая сделка</h2>
        <button onClick={onClose} className="ml-auto text-gray-300 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <Field label="Название"><input className={inputCls} autoFocus placeholder={fallbackTitle} value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Автор">
            <select className={inputCls} value={authorId} onChange={e => setAuthorId(e.target.value)}>
              {authorOptions.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
          <Field label="Бренд">
            <select className={inputCls} value={brandId} onChange={e => { setBrandId(e.target.value); setIsCustomBrand(e.target.value === 'custom'); }}>
              {brands.map(x => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
              <option value="custom">+ Свой бренд...</option>
            </select>
          </Field>
          {isCustomBrand && (
            <Field label="Название бренда">
              <input className={inputCls} placeholder="Введите название бренда или кампании..." value={customBrand} onChange={e => setCustomBrand(e.target.value)} />
            </Field>
          )}
          <Field label="Бюджет, ₽"><input className={inputCls + ' tabular-nums'} type="number" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
          <Field label="Тип контента">
            <select className={inputCls} value={type} onChange={e => setType(e.target.value as Deal['type'])}>
              {(['Stories', 'Reels', 'Пост', 'Видео'] as const).map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Дата публикации"><input className={inputCls} type="date" value={pubDate} onChange={e => setPubDate(e.target.value)} /></Field>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3.5 py-2.5 text-[11.5px] font-semibold text-indigo-700">
          Подсказка из базы знаний {foundBrand?.name ?? finalBrandName}: по умолчанию действует условие «{defaultPayLabel}»
        </div>
      </div>
      <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 bg-slate-50/50">
        <Btn variant="ghost" onClick={onClose}>Отмена</Btn>
        <Btn onClick={create} disabled={authorOptions.length === 0}><Plus size={14} />Создать сделку</Btn>
      </div>
    </Modal>
  );
}

/* ===== Глобальный поиск ⌘K ===== */
function SearchOverlay({ onClose, deals, onPick }: {
  onClose: () => void; deals: Deal[];
  onPick: (kind: 'deal' | 'author' | 'brand', id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [creators, setCreators] = useState<CreatorRecord[]>([]);
  const brands = useBrands();

  useEffect(() => {
    let active = true;
    api.getCreators()
      .then(records => { if (active) setCreators(records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    const authorRows = creators.flatMap(c => {
      const accountId = String(c.accountid ?? c.accountId ?? c.id ?? '').trim();
      if (!accountId || accountId === 'undefined' || accountId === 'null') return [];
      const rawHandle = c.handle ?? c.username;
      const nick = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : (c.name ?? accountId);
      const followers = c.followers ?? c.subscribers_count;
      const er = c.er ?? c.static_avg_er;
      const sub = [c.platform ?? c.Platform, followers != null ? fmtNum(followers) : null, er != null ? `ER ${er}%` : null]
        .filter((x): x is string => Boolean(x))
        .join(' · ');
      return [{ id: accountId, nick, sub, hue: c.hue ?? hashHue(accountId || nick) }];
    });
    if (!s) return { deals: deals.slice(0, 3), authors: authorRows.slice(0, 3), brands: brands.slice(0, 3) };
    return {
      deals: deals.filter(d => d.title.toLowerCase().includes(s)).slice(0, 4),
      authors: authorRows.filter(a => a.nick.toLowerCase().includes(s) || a.id.toLowerCase().includes(s)).slice(0, 4),
      brands: brands.filter(b => b.name.toLowerCase().includes(s)).slice(0, 4),
    };
  }, [q, deals, creators, brands]);
  const total = res.deals.length + res.authors.length + res.brands.length;

  return (
    <Modal onClose={onClose} w="max-w-[560px]" dark>
      <div className="flex items-center gap-2.5 px-4 border-b border-gray-100">
        <Search size={16} className="text-gray-300" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Сделка, автор или бренд…"
          className="flex-1 h-12 text-[14px] font-medium outline-none bg-transparent placeholder:text-gray-300" />
        <span className="kbd">esc</span>
      </div>
      <div className="p-2.5 max-h-[420px] overflow-y-auto scroll-thin">
        {total === 0 && <div className="py-10 text-center text-[13px] font-semibold text-gray-400">Ничего не найдено по запросу «{q}»</div>}
        {res.deals.length > 0 && <GroupTitle>Сделки</GroupTitle>}
        {res.deals.map(d => (
          <Row key={d.id} onClick={() => onPick('deal', d.id)}
            left={<Briefcase size={14} className="text-indigo-500" />}
            main={d.title} sub={`${resolveAuthor(d).nick} · ${fmtMoney(d.budget)} · ${STAGES.find(s => s.id === d.stage)?.name}`} />
        ))}
        {res.authors.length > 0 && <GroupTitle>Авторы</GroupTitle>}
        {res.authors.map(a => (
          <Row key={a.id} onClick={() => onPick('author', a.id)} left={<Avatar nick={a.nick} hue={a.hue} size={22} />}
            main={a.nick} sub={a.sub} />
        ))}
        {res.brands.length > 0 && <GroupTitle>Бренды · база знаний</GroupTitle>}
        {res.brands.map(b => (
          <Row key={b.id} onClick={() => onPick('brand', String(b.id))}
            left={<span className="w-[22px] h-[22px] rounded-md text-[9px] font-extrabold text-white flex items-center justify-center" style={{ background: `hsl(${b.hue} 70% 50%)` }}>{brandLetter(b)}</span>}
            main={b.name} sub={`${b.category} · ${b.status}`} />
        ))}
      </div>
    </Modal>
  );
}
function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-2.5 pb-1 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">{children}</div>;
}
function Row({ left, main, sub, onClick }: { left: React.ReactNode; main: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 text-left transition-colors">
      <span className="shrink-0 flex items-center">{left}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-gray-900 truncate">{main}</span>
        <span className="block text-[11px] font-semibold text-gray-400 truncate">{sub}</span>
      </span>
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<Record<string, unknown> | null>(() => {
    consumeInboundSession();
    return api.getCurrentUser();
  });
  const [authed, setAuthed] = useState<boolean>(() => api.isAuthenticated());

  useEffect(() => {
    if (!api.isAuthenticated()) return;
    api.getMe()
      .then(me => { api.updateUser(me); setUser(me); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    (window as unknown as { cfSupportFloating?: (show: boolean) => void }).cfSupportFloating?.(!authed);
  }, [authed]);

  useEffect(() => {
    const onAuthExpired = () => {
      setUser(null);
      setAuthed(false);
      window.location.hash = '';
    };
    window.addEventListener('creatorflow:auth_expired', onAuthExpired);
    return () => window.removeEventListener('creatorflow:auth_expired', onAuthExpired);
  }, []);

  useEffect(() => {
    if (!api.isAuthenticated()) return;
    const redirectTarget = getRedirectTarget();
    if (!redirectTarget) return;
    window.location.href = buildRedirectUrl(redirectTarget, api.getToken(), api.getCurrentUser());
  }, []);

  const handleLogin = (loggedIn: Record<string, unknown>) => {
    setUser(loggedIn);
    setAuthed(true);
    const redirectTarget = getRedirectTarget();
    if (redirectTarget) {
      window.location.href = buildRedirectUrl(redirectTarget, api.getToken(), loggedIn);
      return;
    }
    window.location.hash = '#/authors';
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setAuthed(false);
    window.location.hash = '#/authors';
  };

  return (
    <ToastProvider>
      {authed ? <Shell key={String(user?.id ?? user?.email ?? 'guest')} user={user} onLogout={handleLogout} /> : <LoginModal onLogin={handleLogin} />}
    </ToastProvider>
  );
}
