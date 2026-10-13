import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, ErrorState, Select, SkeletonLines } from '../../components/kit';
import { api, type AnalyticsSummary, type BrandItem, type PublicationItem } from '../../services/api';

type Period = '30d' | '6m' | '1y';
type Tab = 'overview' | 'pubs';
type PubFilter = 'all' | 'no-erid' | 'sync-error';

const PERIODS: { v: Period; label: string }[] = [
  { v: '30d', label: '30 дней' },
  { v: '6m', label: 'Полгода' },
  { v: '1y', label: 'Год' },
];

const SYNC_LABELS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Актуально', cls: 'text-emerald-700' },
  syncing: { label: 'Синхронизация', cls: 'text-brand-700' },
  waiting: { label: 'Ожидание', cls: 'text-gray-600' },
  error: { label: 'Ошибка', cls: 'text-red-700' },
};

const num = (n: number) => n.toLocaleString('ru-RU');

const fmtMoneyCompact = (v: number): string => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace('.', ',').replace(',00', '')} млн ₽`;
  if (v >= 1_000) return `${Math.round(v / 1_000).toLocaleString('ru-RU')} тыс. ₽`;
  return `${num(v)} ₽`;
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
};

export default function AnalyticsScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('6m');
  const [brandId, setBrandId] = useState<string>('all');
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [pubs, setPubs] = useState<PublicationItem[]>([]);
  const [shortlistCount, setShortlistCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pubFilter, setPubFilter] = useState<PubFilter>('all');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    api.getBrands().then(setBrands).catch(() => setBrands([]));
    api.getShortlist().then(items => setShortlistCount(items.length)).catch(() => setShortlistCount(0));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const brandParam = brandId === 'all' ? {} : { brandId: Number(brandId) };
    Promise.all([
      api.getAnalyticsSummary({ period, ...brandParam }),
      api.getPublications(brandParam),
    ])
      .then(([s, p]) => {
        setSummary(s);
        setPubs(p);
        setLoading(false);
      })
      .catch(() => {
        setError('Не удалось загрузить аналитику');
        setLoading(false);
      });
  }, [period, brandId]);

  useEffect(() => { load(); }, [load]);

  const brandOptions = useMemo(() => [
    { v: 'all', label: 'Все бренды' },
    ...brands.map(b => ({ v: String(b.id), label: b.name })),
  ], [brands]);

  const brandName = brandId === 'all' ? 'все бренды' : (brands.find(b => String(b.id) === brandId)?.name ?? '');

  const noEridCount = useMemo(() => pubs.filter(p => !p.erid).length, [pubs]);
  const syncErrorCount = useMemo(() => pubs.filter(p => p.sync_status === 'error').length, [pubs]);
  const eridShare = pubs.length > 0 ? Math.round((pubs.length - noEridCount) / pubs.length * 100) : null;

  const filteredPubs = useMemo(() => {
    if (pubFilter === 'no-erid') return pubs.filter(p => !p.erid);
    if (pubFilter === 'sync-error') return pubs.filter(p => p.sync_status === 'error');
    return pubs;
  }, [pubs, pubFilter]);

  const chart = useMemo(() => {
    const rev = summary?.revenue ?? [];
    if (rev.length === 0) return null;
    const max = Math.max(...rev.map(r => r.revenue), 0.01);
    const step = rev.length > 1 ? 100 / (rev.length - 1) : 0;
    const pts = rev.map((r, i) => ({ x: Math.round(i * step * 10) / 10, y: Math.round((100 - r.revenue / max * 100) * 10) / 10, label: r.period, value: r.revenue }));
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x + ',' + p.y).join(' ');
    return { pts, line, area: line + ' L100,100 L0,100 Z', max };
  }, [summary]);

  const funnelMax = useMemo(() => Math.max(...(summary?.funnel ?? []).map(f => f.count), 1), [summary]);
  const topMax = useMemo(() => Math.max(...(summary?.top_authors ?? []).map(t => t.revenue), 1), [summary]);
  const netsMax = useMemo(() => Math.max(...(summary?.networks ?? []).map(n => n.share), 1), [summary]);

  const tabCls = (on: boolean) =>
    'inline-flex items-center gap-1.5 h-[42px] px-3 -mb-px border-b-2 text-[13.5px] transition-colors ' +
    (on ? 'border-brand-600 font-bold text-brand-700' : 'border-transparent font-semibold text-gray-600 hover:text-gray-800');

  return (
    <div className="h-full overflow-y-auto scroll-thin bg-page">
      <div className="px-6 pt-5 pb-8 flex flex-col gap-4 max-w-[1200px]">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-collab font-semibold text-ink">Аналитика</h1>
            <p className="text-[12.5px] font-medium text-muted mt-1">Сводка по аккаунту · {brandName}</p>
          </div>
          <Select options={brandOptions} value={brandId} onChange={setBrandId} label="Бренд" width={200} />
        </div>

        <div role="tablist" className="flex gap-1 border-b border-line">
          <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')} className={tabCls(tab === 'overview')}>Обзор</button>
          <button type="button" role="tab" aria-selected={tab === 'pubs'} onClick={() => setTab('pubs')} className={tabCls(tab === 'pubs')}>
            Публикации
            <span className={'text-[10.5px] font-extrabold px-1.5 py-px rounded-md ' + (tab === 'pubs' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600')}>{pubs.length}</span>
          </button>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="bg-white border border-line rounded-[14px] p-4"><SkeletonLines rows={2} /></div>)}
          </div>
        )}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && tab === 'overview' && summary && (
          <div className="flex flex-col gap-4">
            <div role="group" aria-label="Период" className="self-start flex p-[3px] gap-0.5 rounded-[10px] bg-[#eef0f4]">
              {PERIODS.map(p => (
                <button key={p.v} type="button" onClick={() => setPeriod(p.v)} aria-pressed={period === p.v}
                  className={'h-[30px] px-3.5 rounded-lg text-[12.5px] transition-colors ' + (period === p.v ? 'font-bold bg-white text-ink shadow-sm' : 'font-semibold text-gray-600 hover:text-gray-800')}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-white border border-line rounded-[14px] p-4">
                <div className="text-[12px] font-semibold text-muted">Выручка</div>
                <div className="font-collab text-[22px] font-bold mt-1.5 tabular-nums">{fmtMoneyCompact(summary.totals.revenue)}</div>
                <div className="mt-1.5 text-[12px] font-semibold text-muted">за выбранный период</div>
              </div>
              <div className="bg-white border border-line rounded-[14px] p-4">
                <div className="text-[12px] font-semibold text-muted">Сделок в работе</div>
                <div className="font-collab text-[22px] font-bold mt-1.5 tabular-nums">{summary.totals.deals}</div>
                <div className="mt-1.5 text-[12px] font-semibold text-muted">+ {shortlistCount} авторов в шорт-листе</div>
              </div>
              <div className="bg-white border border-line rounded-[14px] p-4">
                <div className="text-[12px] font-semibold text-muted">Средний ROAS</div>
                <div className="font-collab text-[22px] font-bold mt-1.5 tabular-nums">{summary.totals.avg_roas !== null ? String(summary.totals.avg_roas).replace('.', ',') + '×' : '—'}</div>
                <div className="mt-1.5 text-[12px] font-semibold text-muted">{summary.totals.avg_roas !== null ? 'по публикациям периода' : 'нет данных о расходах'}</div>
              </div>
              <div className="bg-white border border-line rounded-[14px] p-4">
                <div className="text-[12px] font-semibold text-muted">Маркировка ERID</div>
                <div className="font-collab text-[22px] font-bold mt-1.5 tabular-nums">{eridShare !== null ? eridShare + '%' : '—'}</div>
                {noEridCount > 0 ? (
                  <button type="button" onClick={() => { setTab('pubs'); setPubFilter('no-erid'); }} className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-bold text-amber-700 hover:text-amber-800">
                    <AlertTriangle size={13} />{noEridCount} публикации без маркера →
                  </button>
                ) : (
                  <div className="mt-1.5 text-[12px] font-semibold text-muted">все публикации промаркированы</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <section aria-labelledby="rv-h" className="bg-white border border-line rounded-[14px] px-[18px] py-4">
                <h2 id="rv-h" className="m-0 text-[14px] font-bold text-ink">Выручка по месяцам</h2>
                <div className="text-[12px] text-muted mt-0.5">млн ₽, за выбранный период</div>
                {chart && chart.pts.some(p => p.value > 0) ? (
                  <>
                    <div className="relative h-[180px] mt-4 ml-[34px]">
                      <div aria-hidden="true" className="absolute -left-[34px] -top-1.5 text-[10.5px] text-gray-400">{String(chart.max).replace('.', ',')}</div>
                      <div aria-hidden="true" className="absolute -left-[34px] top-[84px] text-[10.5px] text-gray-400">{String(Math.round(chart.max / 2 * 10) / 10).replace('.', ',')}</div>
                      <div aria-hidden="true" className="absolute -left-[34px] -bottom-1.5 text-[10.5px] text-gray-400">0</div>
                      <div aria-hidden="true" className="absolute left-0 right-0 top-0 border-t border-slate-100" />
                      <div aria-hidden="true" className="absolute left-0 right-0 top-1/2 border-t border-slate-100" />
                      <div aria-hidden="true" className="absolute left-0 right-0 bottom-0 border-t border-line" />
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 w-full h-full overflow-visible">
                        <path d={chart.area} fill="rgba(99,102,241,.10)" />
                        <path d={chart.line} fill="none" stroke="#6366f1" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                      </svg>
                      {chart.pts.map((p, i) => (
                        <button key={i} type="button" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onMouseLeave={() => setHover(null)}
                          aria-label={`${p.label}: ${String(p.value).replace('.', ',')} млн ₽`}
                          className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-0 p-0"
                          style={{ left: p.x + '%', top: p.y + '%' }}>
                          <span className={'block w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_0_2px_#ffffff] ' + (hover === i ? 'shadow-[0_0_0_2px_#ffffff,0_0_0_6px_rgba(99,102,241,.2)]' : '')} />
                        </button>
                      ))}
                      {hover !== null && chart.pts[hover] && (
                        <div role="status" className="absolute whitespace-nowrap px-2.5 py-[5px] rounded-[7px] bg-ink text-white text-[12px] font-medium pointer-events-none"
                          style={{ left: chart.pts[hover].x + '%', top: chart.pts[hover].y + '%', transform: `translate(${hover === chart.pts.length - 1 ? '-100%' : hover === 0 ? '0' : '-50%'},-150%)` }}>
                          <b>{chart.pts[hover].label}</b> · {String(chart.pts[hover].value).replace('.', ',')} млн ₽
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between mt-2 ml-[34px] text-[11.5px] text-muted">
                      {chart.pts.map((p, i) => <span key={i}>{p.label}</span>)}
                    </div>
                  </>
                ) : (
                  <div className="py-8"><Empty title="Нет данных о выручке" text="За выбранный период публикаций с выручкой нет" /></div>
                )}
              </section>

              <section aria-labelledby="fn-h" className="bg-white border border-line rounded-[14px] px-[18px] py-4">
                <h2 id="fn-h" className="m-0 text-[14px] font-bold text-ink">Воронка сделок</h2>
                <div className="text-[12px] text-muted mt-0.5">сколько сделок на каждом этапе · ещё {shortlistCount} авторов в шорт-листе</div>
                <div className="flex flex-col gap-2.5 mt-4">
                  {summary.funnel.map(f => {
                    const pct = Math.round(f.count / funnelMax * 100);
                    return (
                      <div key={f.stage} className="grid grid-cols-[150px_minmax(0,1fr)_72px] items-center gap-3 text-[12.5px]">
                        <span className="font-semibold text-gray-700">{f.label}</span>
                        <span className="h-4 block"><span className="block h-full rounded bg-brand-500" style={{ width: pct + '%' }} /></span>
                        <span className="text-right tabular-nums"><b>{f.count}</b> <span className="text-muted">{pct}%</span></span>
                      </div>
                    );
                  })}
                  {summary.funnel.every(f => f.count === 0) && <Empty title="Сделок пока нет" text="Воронка заполнится по мере работы" />}
                </div>
              </section>

              <section aria-labelledby="ta-h" className="bg-white border border-line rounded-[14px] px-[18px] py-4">
                <h2 id="ta-h" className="m-0 text-[14px] font-bold text-ink">Топ-5 авторов по выручке</h2>
                <div className="flex flex-col gap-2.5 mt-4">
                  {summary.top_authors.map(t => (
                    <div key={t.author_id} className="grid grid-cols-[140px_minmax(0,1fr)_90px] items-center gap-3 text-[12.5px]">
                      <span className="font-bold text-ink truncate">{t.handle}</span>
                      <span className="h-4 block"><span className="block h-full rounded bg-brand-500" style={{ width: Math.round(t.revenue / topMax * 100) + '%' }} /></span>
                      <span className="text-right font-bold tabular-nums">{num(t.revenue)} ₽</span>
                    </div>
                  ))}
                  {summary.top_authors.length === 0 && <Empty title="Нет данных" text="Авторы появятся после первых публикаций" />}
                </div>
              </section>

              <section aria-labelledby="sn-h" className="bg-white border border-line rounded-[14px] px-[18px] py-4">
                <h2 id="sn-h" className="m-0 text-[14px] font-bold text-ink">Публикации по соцсетям</h2>
                <div className="flex flex-col gap-2.5 mt-4">
                  {summary.networks.map(n => (
                    <div key={n.platform} className="grid grid-cols-[100px_minmax(0,1fr)_48px] items-center gap-3 text-[12.5px]">
                      <span className="font-semibold text-gray-700 capitalize">{n.platform}</span>
                      <span className="h-4 block"><span className="block h-full rounded bg-brand-400" style={{ width: Math.round(n.share / netsMax * 100) + '%' }} /></span>
                      <span className="text-right font-bold tabular-nums">{n.share}%</span>
                    </div>
                  ))}
                  {summary.networks.length === 0 && <Empty title="Нет данных" text="Публикации появятся после запуска кампаний" />}
                </div>
              </section>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'pubs' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPubFilter('all')}
                className={'text-[12px] font-bold px-2.5 py-1 rounded-full transition-colors ' + (pubFilter === 'all' ? 'bg-ink text-white' : 'border border-line bg-white text-gray-700 hover:border-gray-300')}>
                Все · {pubs.length}
              </button>
              <button type="button" onClick={() => setPubFilter('no-erid')}
                className={'text-[12px] font-semibold px-2.5 py-1 rounded-full border transition-colors ' + (pubFilter === 'no-erid' ? 'border-red-300 bg-red-50 text-red-700' : 'border-red-200 bg-red-50/60 text-red-700 hover:bg-red-50')}>
                Без ERID · {noEridCount}
              </button>
              <button type="button" onClick={() => setPubFilter('sync-error')}
                className={'text-[12px] font-semibold px-2.5 py-1 rounded-full border transition-colors ' + (pubFilter === 'sync-error' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line bg-white text-gray-700 hover:border-gray-300')}>
                Ошибка синхронизации · {syncErrorCount}
              </button>
            </div>
            <div className="bg-white border border-line rounded-xl overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] font-bold text-muted uppercase tracking-wide bg-page border-b border-slate-100">
                    <th className="px-4 py-2.5">Публикация</th><th className="px-3 py-2.5">Тип</th><th className="px-3 py-2.5">Дата</th>
                    <th className="px-3 py-2.5 text-right">Просмотры</th><th className="px-3 py-2.5 text-right">Клики</th><th className="px-3 py-2.5 text-right">Выручка</th><th className="px-3 py-2.5 text-right">ROAS</th>
                    <th className="px-3 py-2.5">ERID</th><th className="px-4 py-2.5">Данные</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPubs.map(p => {
                    const sync = SYNC_LABELS[p.sync_status] ?? SYNC_LABELS.waiting;
                    const roas = p.cost > 0 ? (p.revenue / p.cost).toFixed(1).replace('.', ',') + '×' : '—';
                    return (
                      <tr key={p.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-2.5 max-w-[340px]">
                          {p.url ? (
                            <a href={p.url} target="_blank" rel="noreferrer" className="block font-semibold text-brand-600 hover:text-brand-700 truncate">{p.text || p.url}</a>
                          ) : (
                            <span className="block font-semibold text-ink truncate">{p.text || 'Без названия'}</span>
                          )}
                          <span className="block text-[11px] font-semibold text-muted mt-0.5">{p.author_handle ?? '—'} · {p.platform}</span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-gray-700">{p.type}</td>
                        <td className="px-3 py-2.5 text-muted font-semibold whitespace-nowrap">{fmtDate(p.published_at)}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{num(p.views)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(p.clicks)}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{num(p.revenue)} ₽</td>
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{roas}</td>
                        <td className="px-3 py-2.5">
                          <span className={'text-[11.5px] font-bold px-2 py-0.5 rounded-md border ' + (p.erid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200')}>
                            {p.erid ? 'Есть' : 'Нет'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5"><span className={'text-[12px] font-bold ' + sync.cls}>{sync.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredPubs.length === 0 && (
                <div className="py-10">
                  <Empty title="Публикаций нет" text={pubFilter === 'all' ? 'Публикации появятся после запуска кампаний' : 'По этому фильтру публикаций нет'} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
