import { Archive, Building2, Check, ChevronDown, ChevronRight, CreditCard, Download, Plus, Search, ShieldAlert, ShieldCheck, Upload, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, ErrorState, Select, SkeletonLines } from '../../components/kit';
import { Avatar, Btn, Modal, SidePanel, useToast } from '../../components/ui';
import { userName, api,
  normalizeSocial,
  type BrandItem,
  type CreatorImportPreview,
  type CreatorRecord,
  type EridRecord,
  type PublicationItem,
  type ShortlistItem,
  type SubscriptionStatusInfo,
} from '../../services/api';
import { planTitle } from '../pricing/planMeta';
import type { Social } from '../../data';

type Section = 'brands' | 'authors' | 'erid';

const SEARCH_HOME = (import.meta.env.VITE_SEARCH_URL as string | undefined) || 'https://collabrama.ru/';

const ERID_STATUS_STYLE: Record<string, string> = {
  'Заполняют данные': 'bg-violet-50 text-violet-700 border-violet-200',
  'Активен': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Ожидает публикации': 'bg-amber-50 text-amber-800 border-amber-200',
  'Опубликован': 'bg-blue-50 text-blue-700 border-blue-200',
  'Архивирован': 'bg-gray-100 text-gray-600 border-line',
};

const ERID_STATUS_FILTERS: { v: string; label: string }[] = [
  { v: 'all', label: 'Все' },
  { v: 'Заполняют данные', label: 'Заполняют данные' },
  { v: 'Ожидает публикации', label: 'Ждут публикации' },
  { v: 'Опубликован', label: 'Опубликованы' },
  { v: 'Архивирован', label: 'Архив' },
];

type AuthorRow = {
  id: string;
  accountId: string;
  name: string;
  nick: string;
  soc: Social;
  followers: number | null;
  er: number | null;
  geo: string;
  src: string;
  inShort: boolean;
};

const hashHue = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
};

const fmtFollowers = (n: number | null): string => {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(n);
};

const fmtEr = (v: number | null): string => {
  if (v === null || v === undefined) return '—';
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU');
};

const srcLabel = (source: string | null | undefined): string => {
  switch ((source ?? '').toLowerCase()) {
    case 'search': return 'AI-подбор';
    case 'manual': return 'Вручную';
    case 'import':
    case 'file': return 'Файл';
    default: return '—';
  }
};

const creatorAccountId = (c: CreatorRecord): string => String(c.accountid || c.accountId || c.id || '');

const creatorToRow = (c: CreatorRecord, shortSet: Set<string>): AuthorRow => {
  const accountId = creatorAccountId(c);
  const rawNick = c.username || c.handle || c.instagram || c.name || c.Name || accountId;
  return {
    id: String(c.id || accountId),
    accountId,
    name: c.name || c.Name || c.title || 'Без имени',
    nick: rawNick.startsWith('@') ? rawNick : `@${rawNick}`,
    soc: normalizeSocial(c.platform || c.Platform || 'Instagram'),
    followers: c.followers ?? c.subscribers_count ?? null,
    er: c.er ?? c.static_avg_er ?? null,
    geo: '—',
    src: srcLabel(c.source),
    inShort: shortSet.has(accountId),
  };
};

const shortToRow = (item: ShortlistItem): AuthorRow => {
  const a = item.author;
  const rawNick = a?.username || a?.title || item.account_id;
  return {
    id: item.account_id,
    accountId: item.account_id,
    name: a?.title || 'Без имени',
    nick: rawNick.startsWith('@') ? rawNick : `@${rawNick}`,
    soc: normalizeSocial(a?.platform || 'Instagram'),
    followers: a?.subscribers_count ?? null,
    er: a?.static_avg_er ?? null,
    geo: '—',
    src: '—',
    inShort: true,
  };
};

const downloadCsv = (filename: string, header: string[], rows: string[][]) => {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map(r => r.map(esc).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const openSimilarSearch = (accountIds: string[]) => {
  const target = new URL(SEARCH_HOME);
  target.searchParams.set('similar', accountIds.slice(0, 50).join(','));
  target.searchParams.set('from', 'crm');
  const token = api.getToken();
  if (token) target.searchParams.set('session_token', token);
  const user = api.getCurrentUser();
  if (user?.id !== undefined && user?.id !== null) target.searchParams.set('user_id', String(user.id));
  if (typeof user?.email === 'string') target.searchParams.set('user_email', user.email);
  window.location.href = target.toString();
};

const initials = (name: string): string => {
  const parts = name.replace(/^@/, '').split(/[\s]+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
};

export default function SettingsScreen({ user, onOpenBrand }: {
  user: Record<string, unknown> | null;
  onOpenBrand: (brandId: number) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<Section>('brands');
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [creators, setCreators] = useState<CreatorRecord[]>([]);
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [eridRecords, setEridRecords] = useState<EridRecord[]>([]);
  const [pubs, setPubs] = useState<PublicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBrandOpen, setNewBrandOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getBrands(),
      api.getCreators(),
      api.getShortlist(),
      api.getEridRecords(),
      api.getPublications(),
    ])
      .then(([b, c, s, e, p]) => {
        setBrands(b);
        setCreators(c);
        setShortlist(s);
        setEridRecords(e);
        setPubs(p);
        setLoading(false);
      })
      .catch(() => {
        setError('Не удалось загрузить настройки');
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const noEridPubs = useMemo(() => pubs.filter(p => !p.erid), [pubs]);

  const name = userName(user);
  const email = typeof user?.email === 'string' ? user.email : '';

  const widget = (id: Section, title: string, sub: string, icon: React.ReactNode) => {
    const on = open === id;
    return (
      <button type="button" onClick={() => setOpen(id)} aria-expanded={on}
        className={'flex items-center gap-3 w-full box-border px-4 py-3.5 rounded-[14px] bg-white transition-colors border text-left ' + (on ? 'border-brand-300' : 'border-line hover:border-brand-200')}>
        <span className="w-10 h-10 rounded-[10px] bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-ink">{title}</span>
          <span className="block text-[12.5px] text-muted mt-0.5">{sub}</span>
        </span>
        <ChevronDown size={18} className={'shrink-0 transition-transform ' + (on ? 'rotate-180 text-brand-600' : 'text-gray-400')} />
      </button>
    );
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin bg-page">
      <div className="px-6 pt-5 pb-8 flex flex-col gap-4 max-w-[1200px]">
        <div>
          <h1 className="text-[22px] font-collab font-semibold text-ink">Настройки профиля</h1>
          <p className="text-[12.5px] font-medium text-muted mt-1">Имя и почта аккаунта</p>
        </div>

        <section aria-label="Профиль" className="flex flex-wrap items-center gap-4 px-4 py-3.5 rounded-2xl bg-white border border-line">
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, hsl(255 70% 55%), hsl(285 65% 45%))' }}>
            {initials(name || email)}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold text-ink">{name || '—'}</div>
            <div className="text-[13px] text-muted">{email || '—'}</div>
          </div>
        </section>

        <SubscriptionCard />

        <div className="mt-2">
          <h2 className="text-[18px] font-collab font-semibold text-ink">Настройки бренда</h2>
          <p className="text-[12.5px] font-medium text-muted mt-1">Клиенты и бренды, общая база авторов и маркировка рекламы</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {widget('brands', 'Клиенты и бренды', `${brands.length} брендов · продукт, правила, условия, реквизиты`, <Building2 size={20} />)}
          {widget('authors', 'База авторов', `${creators.length} авторов · ${shortlist.length} в шорт-листе`, <Users size={20} />)}
          {widget('erid', 'Маркировка ERID', `${eridRecords.length} маркеров · ${noEridPubs.length} публикации без ERID`, <ShieldCheck size={20} />)}
        </div>

        {loading && <div className="bg-white border border-line rounded-[14px] p-5"><SkeletonLines rows={6} /></div>}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && open === 'brands' && (
          <BrandsSection
            brands={brands}
            eridRecords={eridRecords}
            pubs={pubs}
            onOpenBrand={onOpenBrand}
            onNewBrand={() => setNewBrandOpen(true)}
            onArchive={(brand) => {
              api.deleteBrand(brand.id)
                .then(() => {
                  setBrands(prev => prev.filter(b => b.id !== brand.id));
                  toast('info', `Бренд «${brand.name}» удалён`);
                })
                .catch(() => toast('err', 'Не удалось удалить бренд'));
            }}
          />
        )}

        {!loading && !error && open === 'authors' && (
          <AuthorsSection
            creators={creators}
            shortlist={shortlist}
            onChanged={load}
          />
        )}

        {!loading && !error && open === 'erid' && (
          <EridSection
            records={eridRecords}
            brands={brands}
            noEridPubs={noEridPubs}
            onChanged={load}
          />
        )}
      </div>

      {newBrandOpen && (
        <NewBrandModal
          onClose={() => setNewBrandOpen(false)}
          onCreated={(brand) => {
            setNewBrandOpen(false);
            load();
            onOpenBrand(brand.id);
          }}
        />
      )}
    </div>
  );
}

function SubscriptionCard() {
  const [sub, setSub] = useState<SubscriptionStatusInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.getSubscription()
      .then(setSub)
      .catch(() => setFailed(true));
  }, []);

  const fmtDate = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  let badge: { label: string; cls: string };
  if (sub?.is_active) badge = { label: 'Активна', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  else if (sub?.status === 'trial') badge = { label: 'Триал', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  else if (sub?.expires_at) badge = { label: 'Истекла', cls: 'bg-red-50 text-red-600 border-red-200' };
  else badge = { label: 'Не оформлена', cls: 'bg-gray-100 text-gray-500 border-line' };

  return (
    <section aria-label="Подписка" className="flex flex-wrap items-center gap-4 px-4 py-3.5 rounded-2xl bg-white border border-line">
      <span className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
        <CreditCard size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-extrabold text-ink">Подписка</span>
          {sub && <span className={`px-2 h-5.5 inline-flex items-center rounded-full border text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>}
        </div>
        <div className="text-[13px] text-muted mt-0.5">
          {failed && 'Не удалось загрузить статус подписки'}
          {!failed && !sub && 'Загружаем статус…'}
          {sub && (
            <>
              {sub.plan ? `Тариф «${planTitle(sub.plan.name)}»` : sub.status === 'trial' ? 'Тариф «Триал»' : 'Тариф не выбран'}
              {sub.is_active && sub.expires_at && ` · действует до ${fmtDate(sub.expires_at)}`}
              {!sub.is_active && sub.expires_at && ` · истекла ${fmtDate(sub.expires_at)}`}
              {sub.is_active && sub.auto_renew && ' · автопродление включено'}
            </>
          )}
        </div>
      </div>
      <Btn variant="ghost" onClick={() => { window.location.hash = '#/pricing'; }}>
        Тарифы и условия<ChevronRight size={14} />
      </Btn>
    </section>
  );
}

function BrandsSection({ brands, eridRecords, pubs, onOpenBrand, onNewBrand, onArchive }: {
  brands: BrandItem[];
  eridRecords: EridRecord[];
  pubs: PublicationItem[];
  onOpenBrand: (brandId: number) => void;
  onNewBrand: () => void;
  onArchive: (brand: BrandItem) => void;
}) {
  return (
    <section aria-labelledby="br-h" className="bg-white border border-line rounded-[14px] overflow-hidden">
      <div className="px-4 pt-3.5 flex flex-wrap items-center gap-2">
        <h2 id="br-h" className="m-0 text-[16px] font-extrabold text-ink">Бренды</h2>
        <span className="text-[12px] font-extrabold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{brands.length}</span>
        <Btn size="sm" onClick={onNewBrand} className="ml-auto !rounded-full"><Plus size={13} />Добавить бренд</Btn>
      </div>
      <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {brands.map(b => {
          const eridCount = eridRecords.filter(r => r.brand_id === b.id && r.status !== 'Заполняют данные').length;
          const warn = pubs.filter(p => p.brand_id === b.id && !p.erid).length;
          return (
            <article key={b.id} className="flex flex-col gap-3 p-3.5 rounded-[14px] border border-line bg-white">
              <div className="flex items-center gap-2.5">
                <span className="w-[34px] h-[34px] rounded-lg shrink-0 flex items-center justify-center text-[13px] font-extrabold text-white" style={{ background: `linear-gradient(135deg,hsl(${b.hue} 70% 42%),hsl(${b.hue + 25} 65% 32%))` }}>
                  {(b.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-extrabold text-ink truncate">{b.name}</div>
                  <div className="text-[12px] text-muted truncate">{b.category || 'Без категории'}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11.5px] font-bold">
                <span className={'px-2 py-0.5 rounded-md border ' + (warn > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-page text-gray-600 border-line')}>
                  ERID {eridCount}{warn > 0 ? ` · ${warn} без ERID` : ''}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">Сделок: {b.deals_count}</span>
              </div>
              <div className="flex gap-1.5 mt-auto">
                <button type="button" onClick={() => onOpenBrand(b.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-[10px] border border-brand-200 bg-brand-50 text-brand-700 text-[12.5px] font-bold hover:bg-brand-100 transition-colors">
                  Настроить
                </button>
                <button type="button" onClick={() => onArchive(b)} aria-label={`Удалить ${b.name}`} title="Удалить"
                  className="w-9 h-9 border border-line rounded-[10px] bg-white text-gray-400 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors">
                  <Archive size={15} />
                </button>
              </div>
            </article>
          );
        })}
        <button type="button" onClick={onNewBrand}
          className="min-h-[150px] flex flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-brand-200 bg-[#f8f9ff] text-brand-700 text-[13px] font-bold hover:border-brand-300 transition-colors">
          <span className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center"><Plus size={16} /></span>
          Добавить бренд
        </button>
      </div>
      {brands.length === 0 && <div className="px-4 pb-4"><Empty title="Брендов пока нет" text="Добавьте первый бренд, чтобы настроить базу знаний" /></div>}
    </section>
  );
}

function NewBrandModal({ onClose, onCreated }: { onClose: () => void; onCreated: (brand: BrandItem) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    api.createBrand({ name: name.trim(), category: category.trim(), desc: desc.trim(), hue: Math.floor(Math.random() * 360) })
      .then(onCreated)
      .catch(() => { setSaving(false); toast('err', 'Не удалось создать бренд'); });
  };

  return (
    <Modal onClose={onClose} w="max-w-md">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="text-[16px] font-collab font-semibold text-ink">Новый бренд</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Название
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Например, Nike"
            className="h-9 px-3 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Категория
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Спорт и одежда"
            className="h-9 px-3 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Описание
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Коротко о продукте"
            className="resize-none px-3 py-2 rounded-lg border border-line text-[13.5px] text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        </label>
      </div>
      <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
        <Btn variant="secondary" size="sm" onClick={onClose}>Отмена</Btn>
        <Btn size="sm" disabled={!name.trim() || saving} onClick={save}>{saving ? 'Создаём…' : 'Создать бренд'}</Btn>
      </div>
    </Modal>
  );
}

function AuthorsSection({ creators, shortlist, onChanged }: {
  creators: CreatorRecord[];
  shortlist: ShortlistItem[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<'short' | 'all'>('short');
  const [sel, setSel] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const shortSet = useMemo(() => new Set(shortlist.map(s => s.account_id)), [shortlist]);

  const rows = useMemo((): AuthorRow[] => {
    const fromCreators = creators.map(c => creatorToRow(c, shortSet));
    if (tab === 'all') return fromCreators;
    const known = new Set(fromCreators.map(r => r.accountId));
    const onlyShort = shortlist.filter(s => !known.has(s.account_id)).map(shortToRow);
    return [...fromCreators.filter(r => r.inShort), ...onlyShort];
  }, [creators, shortlist, shortSet, tab]);

  const toggleSel = (accountId: string) => {
    setSel(prev => prev.includes(accountId) ? prev.filter(x => x !== accountId) : [...prev, accountId]);
  };

  const toggleShort = (row: AuthorRow) => {
    if (row.inShort) {
      api.removeFromShortlist(row.accountId)
        .then(() => { toast('info', `${row.nick} убран из шорт-листа`); onChanged(); })
        .catch(() => toast('err', 'Не удалось убрать из шорт-листа'));
    } else {
      api.exportShortlist([row.accountId])
        .then(() => { toast('ok', `${row.nick} добавлен в шорт-лист`); onChanged(); })
        .catch(() => toast('err', 'Не удалось добавить в шорт-лист'));
    }
  };

  const removeRow = (row: AuthorRow) => {
    api.deleteCreator(row.id)
      .then(() => { toast('info', `${row.nick} удалён из базы`); setSel(prev => prev.filter(x => x !== row.accountId)); onChanged(); })
      .catch(() => toast('err', 'Не удалось удалить автора'));
  };

  const addOne = () => {
    const v = draft.trim();
    if (!v || adding) return;
    const username = v.replace(/^https?:\/\/[^/]+\//, '').replace(/^@/, '').replace(/\/$/, '');
    if (!username) return;
    setAdding(true);
    api.addCreatorManual({ platform: 'Instagram', username })
      .then(record => {
        const accountId = creatorAccountId(record);
        if (tab === 'short' && accountId) {
          return api.exportShortlist([accountId]).catch(() => undefined);
        }
        return undefined;
      })
      .then(() => { setDraft(''); setAdding(false); toast('ok', `@${username} добавлен`); onChanged(); })
      .catch((err: unknown) => {
        setAdding(false);
        toast('err', err instanceof Error ? err.message : 'Не удалось добавить автора');
      });
  };

  const bulkToShort = () => {
    api.exportShortlist(sel)
      .then(() => { toast('ok', `В шорт-лист добавлено: ${sel.length}`); setSel([]); onChanged(); })
      .catch(() => toast('err', 'Не удалось обновить шорт-лист'));
  };

  const bulkFromShort = () => {
    Promise.allSettled(sel.map(id => api.removeFromShortlist(id)))
      .then(() => { toast('info', 'Выбранные убраны из шорт-листа'); setSel([]); onChanged(); });
  };

  const exportCsv = () => {
    downloadCsv(
      'authors.csv',
      ['Ник', 'Имя', 'Платформа', 'Подписчики', 'ER', 'Источник', 'В шорт-листе'],
      rows.map(r => [r.nick, r.name, r.soc, String(r.followers ?? ''), fmtEr(r.er), r.src, r.inShort ? 'да' : 'нет']),
    );
  };

  const tabCls = (on: boolean) =>
    'inline-flex items-center gap-2 h-9 px-3 rounded-full text-[13px] transition-colors ' +
    (on ? 'font-bold bg-brand-50 text-brand-700' : 'font-semibold text-gray-600 hover:text-gray-800');
  const cntCls = (on: boolean) =>
    'text-[11px] font-extrabold px-[7px] py-px rounded-full ' + (on ? 'bg-white text-brand-700' : 'bg-gray-100 text-gray-600');

  return (
    <section aria-labelledby="ab-h" className="bg-white border border-line rounded-[14px] overflow-hidden">
      <div className="px-4 pt-3.5 flex flex-wrap items-center gap-2">
        <h2 id="ab-h" className="m-0 text-[16px] font-extrabold text-ink">База авторов</h2>
        <div role="tablist" className="flex gap-1 ml-3">
          <button type="button" role="tab" aria-selected={tab === 'short'} onClick={() => { setTab('short'); setSel([]); }} className={tabCls(tab === 'short')}>
            Шорт-лист<span className={cntCls(tab === 'short')}>{shortlist.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => { setTab('all'); setSel([]); }} className={tabCls(tab === 'all')}>
            Вся база<span className={cntCls(tab === 'all')}>{creators.length}</span>
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn variant="secondary" size="sm" onClick={exportCsv} className="!rounded-full"><Download size={13} />Выгрузить</Btn>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-slate-100">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addOne(); }}
          placeholder="Добавить вручную: @ник или ссылка на профиль"
          className="flex-1 min-w-[280px] h-[38px] px-3.5 rounded-[10px] border border-line bg-page text-[13px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        <button type="button" onClick={addOne} disabled={!draft.trim() || adding}
          className="h-[38px] px-3.5 rounded-[10px] border border-brand-200 bg-brand-50 text-brand-700 text-[12.5px] font-bold disabled:opacity-50 hover:bg-brand-100 transition-colors">
          {adding ? 'Добавляем…' : `+ ${tab === 'short' ? 'В шорт-лист' : 'В базу'}`}
        </button>
        <button type="button" onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-[10px] border border-violet-200 bg-violet-50 text-violet-700 text-[12.5px] font-bold hover:bg-violet-100 transition-colors">
          <Upload size={13} />Загрузить файлом
        </button>
      </div>

      {sel.length > 0 && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-900 text-white">
          <span className="text-[13px] font-bold">Выбрано: {sel.length}</span>
          <button type="button" onClick={() => openSimilarSearch(sel)}
            className="ml-auto h-8 px-3 rounded-lg bg-white text-brand-900 text-[12.5px] font-bold hover:bg-brand-50 transition-colors">Найти похожих</button>
          <button type="button" onClick={bulkToShort} className="h-8 px-3 rounded-lg border border-brand-500 text-brand-100 text-[12.5px] font-semibold hover:bg-brand-800 transition-colors">В шорт-лист</button>
          <button type="button" onClick={bulkFromShort} className="h-8 px-3 rounded-lg border border-brand-500 text-brand-100 text-[12.5px] font-semibold hover:bg-brand-800 transition-colors">Убрать из шорт-листа</button>
          <button type="button" aria-label="Снять выбор" onClick={() => setSel([])} className="w-8 h-8 rounded-lg text-brand-200 hover:bg-brand-800 transition-colors">✕</button>
        </div>
      )}

      <div className="px-4 py-3 overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] font-bold text-muted uppercase tracking-wide border-b border-slate-100">
              <th className="px-1.5 py-2 w-7"><span className="sr-only">Выбор</span></th>
              <th className="px-3 py-2">Автор</th>
              <th className="px-3 py-2 text-right">Подписчики</th>
              <th className="px-3 py-2 text-right">ER</th>
              <th className="px-3 py-2">Гео</th>
              <th className="px-3 py-2">Откуда</th>
              <th className="px-3 py-2">Шорт-лист</th>
              <th className="px-1.5 py-2 text-right"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const on = sel.includes(r.accountId);
              return (
                <tr key={r.accountId} className={'border-b border-slate-100 last:border-b-0 ' + (on ? 'bg-violet-50/60' : '')}>
                  <td className="px-1.5 py-1.5">
                    <label className="flex w-7 h-8 items-center justify-center cursor-pointer">
                      <span className="sr-only">Выбрать {r.nick}</span>
                      <input type="checkbox" checked={on} onChange={() => toggleSel(r.accountId)} className="w-4 h-4 accent-brand-600" />
                    </label>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar nick={r.nick} hue={hashHue(r.accountId)} size={32} />
                      <span>
                        <span className="block font-bold text-ink">{r.name}</span>
                        <span className="block text-[11.5px] text-muted">{r.nick} · {r.soc}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmtFollowers(r.followers)}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmtEr(r.er)}</td>
                  <td className="px-3 py-1.5 font-semibold text-gray-700">{r.geo}</td>
                  <td className="px-3 py-1.5">
                    <span className={'text-[11.5px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ' + (r.src === 'AI-подбор' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600')}>{r.src}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => toggleShort(r)} aria-pressed={r.inShort}
                      className={'inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-full text-[12px] font-bold border transition-colors ' + (r.inShort ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-line bg-white text-gray-600 hover:border-gray-300')}>
                      {r.inShort ? 'В шорт-листе' : 'Добавить'}
                    </button>
                  </td>
                  <td className="px-1.5 py-1.5 text-right">
                    <button type="button" onClick={() => removeRow(r)} aria-label={`Удалить ${r.nick} из базы`}
                      className="w-8 h-8 rounded-lg text-gray-400 inline-flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors">
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-8">
            <Empty
              title={tab === 'short' ? 'Шорт-лист пуст' : 'База авторов пуста'}
              text={tab === 'short' ? 'Добавьте авторов из базы или из поиска' : 'Добавьте авторов вручную или файлом'}
            />
          </div>
        )}
      </div>

      {importOpen && <ImportDrawer onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); onChanged(); }} />}
    </section>
  );
}

function ImportDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CreatorImportPreview | null>(null);
  const [target, setTarget] = useState<'both' | 'base'>('both');
  const [busy, setBusy] = useState(false);

  const pickFile = (f: File) => {
    setBusy(true);
    api.previewCreatorsImport(f)
      .then(p => { setFile(f); setPreview(p); setBusy(false); })
      .catch((err: unknown) => { setBusy(false); toast('err', err instanceof Error ? err.message : 'Не удалось прочитать файл'); });
  };

  const commit = () => {
    if (!preview || busy) return;
    const items = preview.items
      .filter(i => i.status === 'new' && i.username)
      .map(i => ({ username: i.username as string, platform: i.platform || 'Instagram' }));
    if (items.length === 0) return;
    setBusy(true);
    api.commitCreatorsImport(items)
      .then(result => {
        if (target === 'both') {
          return api.getCreators()
            .then(records => {
              const wanted = new Set(items.map(i => i.username.toLowerCase()));
              const ids = records.filter(r => wanted.has(String(r.username || r.handle || '').toLowerCase())).map(creatorAccountId).filter(Boolean);
              return ids.length > 0 ? api.exportShortlist(ids).catch(() => undefined).then(() => result) : result;
            })
            .catch(() => result);
        }
        return result;
      })
      .then(result => {
        setBusy(false);
        toast('ok', `Добавлено авторов: ${result.added_count}${result.skipped_count > 0 ? `, пропущено: ${result.skipped_count}` : ''}`);
        onDone();
      })
      .catch(() => { setBusy(false); toast('err', 'Не удалось импортировать авторов'); });
  };

  const TAG_STYLE: Record<string, string> = {
    new: 'bg-emerald-50 text-emerald-700',
    exists: 'bg-amber-50 text-amber-800',
    skip: 'bg-red-50 text-red-700',
  };
  const TAG_LABEL: Record<string, string> = { new: 'новый', exists: 'уже в базе', skip: 'пропустим' };
  const DOT_STYLE: Record<string, string> = { new: 'bg-emerald-500', exists: 'bg-amber-500', skip: 'bg-red-500' };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="imp-h" onClick={e => e.stopPropagation()}
        className="absolute top-0 right-0 bottom-0 w-[480px] max-w-full bg-white border-l border-line shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-[10px] bg-violet-50 text-violet-600 flex items-center justify-center"><Users size={17} /></span>
          <div>
            <h2 id="imp-h" className="m-0 text-[15px] font-extrabold text-ink">Добавить авторов</h2>
            <div className="text-[12px] text-muted">в общую базу и шорт-лист</div>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="ml-auto w-9 h-9 rounded-lg text-gray-500 flex items-center justify-center hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 flex flex-col gap-4">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
          {file && preview ? (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-line bg-page">
              <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-[10px] font-extrabold">{(file.name.split('.').pop() || '').toUpperCase()}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-ink truncate">{file.name}</div>
                <div className="text-[11.5px] text-muted">{preview.total} строк</div>
              </div>
              <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="ml-auto h-8 px-2.5 rounded-lg text-brand-600 text-[12.5px] font-semibold hover:bg-brand-50">Заменить</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-[1.5px] border-dashed border-line bg-page text-muted hover:border-brand-300 hover:text-brand-600 transition-colors">
              <Upload size={20} />
              <span className="text-[13px] font-semibold">{busy ? 'Читаем файл…' : 'Выберите CSV или XLSX'}</span>
            </button>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="px-1.5 py-2.5 rounded-[10px] bg-emerald-50"><div className="text-[18px] font-extrabold text-emerald-800">{preview.new_count}</div><div className="text-[11.5px] font-semibold text-emerald-800">новых</div></div>
                <div className="px-1.5 py-2.5 rounded-[10px] bg-amber-50"><div className="text-[18px] font-extrabold text-amber-800">{preview.exists_count}</div><div className="text-[11.5px] font-semibold text-amber-800">уже в базе</div></div>
                <div className="px-1.5 py-2.5 rounded-[10px] bg-red-50"><div className="text-[18px] font-extrabold text-red-800">{preview.skip_count}</div><div className="text-[11.5px] font-semibold text-red-800">без ссылки</div></div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">Предпросмотр</div>
                <div className="border border-line rounded-xl overflow-hidden">
                  {preview.items.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-100 last:border-b-0 text-[12.5px]">
                      <span className={'w-2 h-2 rounded-full shrink-0 ' + (DOT_STYLE[p.status] ?? 'bg-gray-300')} />
                      <span className="font-bold text-ink">{p.username ? `@${p.username}` : `строка ${p.row}`}</span>
                      <span className="text-muted">{p.platform || p.reason || ''}</span>
                      <span className={'ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full ' + (TAG_STYLE[p.status] ?? 'bg-gray-100 text-gray-600')}>{TAG_LABEL[p.status] ?? p.status}</span>
                    </div>
                  ))}
                  {preview.items.length > 5 && <div className="px-3 py-2 text-[12px] text-muted bg-page">и ещё {preview.items.length - 5}</div>}
                </div>
              </div>
              <fieldset className="border-0 m-0 p-0">
                <legend className="p-0 mb-1.5 text-[11px] font-bold text-muted uppercase tracking-wide">Куда добавить</legend>
                <div role="radiogroup" className="flex p-[3px] gap-0.5 rounded-[10px] bg-[#eef0f4]">
                  {(['both', 'base'] as const).map(v => (
                    <button key={v} type="button" role="radio" aria-checked={target === v} onClick={() => setTarget(v)}
                      className={'flex-1 h-[34px] rounded-lg text-[12.5px] transition-colors ' + (target === v ? 'bg-white text-ink font-bold shadow-sm' : 'text-gray-600 font-semibold')}>
                      {v === 'both' ? 'В базу и шорт-лист' : 'Только в базу'}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="button" onClick={() => downloadCsv('authors_template.csv', ['username', 'platform'], [['example_author', 'Instagram']])}
                className="self-start text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">Скачать шаблон таблицы</button>
            </>
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 flex gap-2">
          <Btn variant="secondary" onClick={onClose}>Отмена</Btn>
          <Btn className="flex-1" disabled={!preview || preview.new_count === 0 || busy} onClick={commit}>
            {busy ? 'Импортируем…' : preview ? `Добавить ${preview.new_count} авторов` : 'Добавить авторов'}
          </Btn>
        </div>
      </aside>
    </div>
  );
}

function EridSection({ records, brands, noEridPubs, onChanged }: {
  records: EridRecord[];
  brands: BrandItem[];
  noEridPubs: PublicationItem[];
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [fBrand, setFBrand] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [selId, setSelId] = useState<number | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const brandOptions = useMemo(() => [
    { v: 'all', label: 'Все бренды' },
    ...brands.map(b => ({ v: String(b.id), label: b.name })),
  ], [brands]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return records.filter(r => {
      if (fBrand !== 'all' && r.brand_id !== Number(fBrand)) return false;
      if (fStatus !== 'all' && r.status !== fStatus) return false;
      if (!s) return true;
      return [r.code, r.author_handle ?? '', r.deal_title ?? ''].join(' ').toLowerCase().includes(s);
    });
  }, [records, q, fBrand, fStatus]);

  const sel = records.find(r => r.id === selId) ?? null;
  const warnHandles = noEridPubs.slice(0, 2).map(p => p.author_handle ?? '—').join(' · ');

  const exportCsv = () => {
    downloadCsv(
      'erid_registry.csv',
      ['ERID-код', 'Сделка', 'Автор', 'Бренд', 'Дата', 'Статус'],
      filtered.map(r => [r.code || '—', r.deal_title ?? '—', r.author_handle ?? '—', r.brand_name ?? '—', fmtDate(r.created_at), r.status]),
    );
  };

  return (
    <section aria-labelledby="er-h" className="bg-white border border-line rounded-[14px] overflow-hidden">
      <div className="px-4 pt-3.5 flex flex-wrap items-center gap-2">
        <h2 id="er-h" className="m-0 text-[16px] font-extrabold text-ink">Реестр ERID-маркеров</h2>
        <span className="text-[12px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">38-ФЗ</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn variant="secondary" size="sm" onClick={exportCsv} className="!rounded-full"><Download size={13} />Экспорт в Excel</Btn>
          <Btn size="sm" onClick={() => setRequestOpen(true)} className="!rounded-full"><Plus size={13} />Запросить ERID</Btn>
        </div>
      </div>

      {noEridPubs.length > 0 && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <ShieldAlert size={16} className="shrink-0" />
          <span className="text-[13px] font-bold">{noEridPubs.length} публикации вышли без ERID-маркера</span>
          <span className="text-[12.5px] text-red-700">{warnHandles}{noEridPubs.length > 2 ? ` · ещё ${noEridPubs.length - 2}` : ''}</span>
        </div>
      )}

      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-slate-100">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Код, автор или сделка…"
            className="w-full h-[38px] pl-8 pr-3.5 rounded-[10px] border border-line bg-page text-[13px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        </div>
        <Select options={brandOptions} value={fBrand} onChange={setFBrand} label="Бренд" width={180} size="md" />
        <div role="group" aria-label="Статус" className="flex p-[3px] gap-0.5 rounded-[10px] bg-[#eef0f4]">
          {ERID_STATUS_FILTERS.map(st => (
            <button key={st.v} type="button" onClick={() => setFStatus(st.v)} aria-pressed={fStatus === st.v}
              className={'h-8 px-3 rounded-lg text-[12.5px] whitespace-nowrap transition-colors ' + (fStatus === st.v ? 'font-bold bg-white text-ink shadow-sm' : 'font-semibold text-gray-600 hover:text-gray-800')}>
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-1 pb-4 overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] font-bold text-muted uppercase tracking-wide border-b border-slate-100">
              <th className="px-3 py-2.5">ERID-код</th>
              <th className="px-3 py-2.5">Сделка</th>
              <th className="px-3 py-2.5">Автор</th>
              <th className="px-3 py-2.5">Бренд</th>
              <th className="px-3 py-2.5">Дата</th>
              <th className="px-3 py-2.5">Статус</th>
              <th className="px-1.5 py-2.5"><span className="sr-only">Открыть</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-2 font-mono text-[11.5px] font-semibold text-gray-700 whitespace-nowrap">{r.code || '— выдаётся после заполнения'}</td>
                <td className="px-3 py-2 max-w-[240px]"><span className="block font-bold text-ink truncate">{r.deal_title ?? '—'}</span></td>
                <td className="px-3 py-2 font-bold">{r.author_handle ?? '—'}</td>
                <td className="px-3 py-2 font-semibold text-gray-600">{r.brand_name ?? '—'}</td>
                <td className="px-3 py-2 text-muted font-semibold tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2">
                  <span className={'text-[11.5px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ' + (ERID_STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-600 border-line')}>{r.status}</span>
                </td>
                <td className="px-1.5 py-2 text-right">
                  <button type="button" onClick={() => setSelId(r.id)} className="h-[30px] px-2.5 rounded-lg border border-line bg-white text-gray-700 text-[12px] font-bold hover:border-brand-300 hover:text-brand-700 transition-colors">Открыть</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-8"><Empty title="Нет маркеров с таким фильтром" text="Измените фильтры или запросите новый ERID" /></div>}
      </div>

      {sel && <EridDrawer record={sel} brands={brands} onClose={() => setSelId(null)} onChanged={onChanged} />}
      {requestOpen && (
        <RequestEridModal
          brands={brands}
          onClose={() => setRequestOpen(false)}
          onCreated={(record) => { setRequestOpen(false); onChanged(); setSelId(record.id); }}
        />
      )}
    </section>
  );
}

function EridDrawer({ record, brands, onClose, onChanged }: {
  record: EridRecord;
  brands: BrandItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [verdict, setVerdictState] = useState<'ok' | 'bad' | null>(record.verdict);
  const isDraft = record.status === 'Заполняют данные';
  const brand = brands.find(b => b.id === record.brand_id);
  const req = brand?.kb?.requisites;

  const setVerdict = (v: 'ok' | 'bad') => {
    const resultText = v === 'ok' ? 'Маркер найден, размещение корректно' : 'Зафиксировано нарушение размещения';
    Promise.all([
      api.updateEridRecord(record.id, { verdict: v }),
      api.addEridCheck(record.id, resultText),
    ])
      .then(([updated]) => {
        setVerdictState(v);
        if (v === 'ok') toast('ok', 'Корректность размещения подтверждена');
        else toast('err', 'Нарушение зафиксировано');
        onChanged();
        void updated;
      })
      .catch(() => toast('err', 'Не удалось сохранить вердикт'));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(record.code)
      .then(() => toast('ok', 'Код скопирован'))
      .catch(() => toast('err', 'Не удалось скопировать код'));
  };

  return (
    <SidePanel onClose={onClose} w="w-[520px]">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wide">ERID-маркер</div>
          <h2 className="m-0 mt-1 font-mono text-[14px] font-semibold break-all">{record.code || '— выдаётся после заполнения'}</h2>
          <div className="flex gap-1.5 mt-2">
            <span className={'text-[11.5px] font-semibold px-2 py-0.5 rounded-md border ' + (ERID_STATUS_STYLE[record.status] ?? 'bg-gray-100 text-gray-600 border-line')}>{record.status}</span>
            <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">38-ФЗ</span>
          </div>
        </div>
        <button type="button" aria-label="Закрыть" onClick={onClose} className="ml-auto w-9 h-9 rounded-lg text-gray-500 flex items-center justify-center hover:bg-gray-100 shrink-0"><X size={16} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 py-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div><div className="text-[11.5px] font-semibold text-muted">Сделка</div><div className="font-bold text-ink">{record.deal_title ?? '—'}</div></div>
          <div><div className="text-[11.5px] font-semibold text-muted">Автор · бренд</div><div className="font-bold text-ink">{record.author_handle ?? '—'} · {record.brand_name ?? '—'}</div></div>
          <div><div className="text-[11.5px] font-semibold text-muted">Дата генерации</div><div className="font-bold text-ink">{fmtDate(record.created_at)}</div></div>
          <div><div className="text-[11.5px] font-semibold text-muted">Требование бренда</div><div className="font-semibold text-gray-700">{brand?.kb?.mentions?.[0] ?? '—'}</div></div>
        </div>

        {record.pub_link ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-page border border-line text-[12.5px]">
            <span className="text-muted">Публикация</span>
            <a href={record.pub_link} target="_blank" rel="noreferrer" className="font-bold text-brand-600 hover:text-brand-700 truncate">{record.pub_link}</a>
          </div>
        ) : (
          <div className="px-3 py-2.5 rounded-[10px] bg-page border border-line text-gray-600 text-[12.5px] font-semibold">
            {isDraft ? 'Маркер ещё не выдан — сначала обе стороны заполняют данные' : 'Публикация ещё не вышла — ссылка появится после размещения'}
          </div>
        )}

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Данные для ОРД</span>
            <span className="text-[12px] text-muted">каждая сторона заполняет свою половину</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="border border-line rounded-xl p-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold">Бренд</span>
                <span className={'ml-auto text-[11.5px] font-bold ' + (req?.company ? 'text-emerald-700' : 'text-amber-700')}>{req?.company ? '✓ Заполнено' : 'Не заполнено'}</span>
              </div>
              <div className="text-[11.5px] text-muted mt-0.5">рекламодатель · из «Реквизитов клиента»</div>
              <dl className="mt-2.5 grid gap-1.5 text-[12px]">
                <div><dt className="text-muted">Рекламодатель, ИНН</dt><dd className="m-0 font-semibold">{req?.company ? `${req.company}${req.inn ? ` · ${req.inn}` : ''}` : 'не заполнено'}</dd></div>
                <div><dt className="text-muted">Объект рекламы</dt><dd className="m-0 font-semibold">{record.brand_name ?? '—'} · из профиля бренда</dd></div>
              </dl>
            </div>
            <div className={'rounded-xl p-3 border ' + (isDraft ? 'border-dashed border-amber-300 bg-[#fffdf5]' : 'border-line')}>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold">Автор</span>
                <span className={'ml-auto text-[11.5px] font-bold ' + (isDraft ? 'text-amber-700' : 'text-emerald-700')}>{isDraft ? 'Ожидает автора' : '✓ Заполнено'}</span>
              </div>
              <div className="text-[11.5px] text-muted mt-0.5">распространитель · {record.author_handle ?? '—'}</div>
              <dl className="mt-2.5 grid gap-1.5 text-[12px]">
                <div><dt className="text-muted">ФИО или компания, ИНН</dt><dd className={'m-0 font-semibold ' + (isDraft ? 'text-gray-400' : '')}>{isDraft ? 'не заполнено' : 'заполнено автором'}</dd></div>
                <div><dt className="text-muted">Площадка</dt><dd className={'m-0 font-semibold ' + (isDraft ? 'text-gray-400' : '')}>{record.author_handle ?? '—'}</dd></div>
              </dl>
            </div>
          </div>
        </div>

        {record.pub_link && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">Проверка размещения</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setVerdict('ok')}
                className={'flex-1 h-[38px] rounded-[10px] text-[12.5px] font-bold border transition-colors ' + (verdict === 'ok' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')}>
                ✓ Подтвердить корректность
              </button>
              <button type="button" onClick={() => setVerdict('bad')}
                className={'h-[38px] px-3.5 rounded-[10px] text-[12.5px] font-bold border transition-colors ' + (verdict === 'bad' ? 'border-red-500 bg-red-500 text-white' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100')}>
                Нарушение
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">История</div>
          <div className="border border-line rounded-xl overflow-hidden">
            {record.checks.map(c => (
              <div key={c.id} className="flex gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 text-[12.5px]">
                <b className="tabular-nums whitespace-nowrap">{fmtDate(c.checked_at)}</b>
                <span className="text-gray-600">{c.result}</span>
                <span className="ml-auto font-bold text-gray-700 whitespace-nowrap">{c.checked_by}</span>
              </div>
            ))}
            {record.checks.length === 0 && <div className="px-3 py-4 text-center text-[12.5px] text-muted">Проверок пока не было</div>}
          </div>
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-slate-100 flex gap-2 shrink-0">
        {!isDraft && record.code && <Btn variant="secondary" onClick={copyCode}>Скопировать код</Btn>}
        {isDraft && <span className="self-center text-[12px] text-muted">ERID выдаётся, когда обе стороны заполнят данные</span>}
        <Btn onClick={onClose} className="ml-auto">Готово</Btn>
      </div>
    </SidePanel>
  );
}

function RequestEridModal({ brands, onClose, onCreated }: {
  brands: BrandItem[];
  onClose: () => void;
  onCreated: (record: EridRecord) => void;
}) {
  const toast = useToast();
  const [brandId, setBrandId] = useState('all');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const brandOptions = useMemo(() => [
    { v: 'all', label: 'Без бренда' },
    ...brands.map(b => ({ v: String(b.id), label: b.name })),
  ], [brands]);

  const save = () => {
    if (saving) return;
    setSaving(true);
    api.createEridRecord({
      brand_id: brandId === 'all' ? null : Number(brandId),
      code: code.trim() || null,
    })
      .then(onCreated)
      .catch(() => { setSaving(false); toast('err', 'Не удалось создать запрос маркировки'); });
  };

  return (
    <Modal onClose={onClose} w="max-w-md">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="text-[16px] font-collab font-semibold text-ink">Запросить ERID</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Бренд
          <Select options={brandOptions} value={brandId} onChange={setBrandId} label="Бренд" width="100%" size="md" />
        </div>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted">Код маркера (если уже выдан в ОРД)
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="ERID-…"
            className="h-9 px-3 rounded-lg border border-line text-[13.5px] font-mono text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        </label>
        <p className="m-0 text-[12px] text-muted leading-relaxed">Если кода пока нет, будет создан запрос маркировки в статусе «Заполняют данные».</p>
      </div>
      <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
        <Btn variant="secondary" size="sm" onClick={onClose}>Отмена</Btn>
        <Btn size="sm" disabled={saving} onClick={save}>{saving ? 'Создаём…' : 'Создать запрос'}</Btn>
      </div>
    </Modal>
  );
}
