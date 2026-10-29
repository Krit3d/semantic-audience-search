import { ArrowDown, ArrowUp, Check, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Select, SkeletonLines } from '../../components/kit';
import { Btn, useToast } from '../../components/ui';
import { api, type BrandItem, type BrandKb, type BrandPayType, type BrandProduct, type BrandRequisites, type EridRecord } from '../../services/api';

type Tab = 'main' | 'product' | 'rules' | 'terms';

const TABS: { id: Tab; label: string }[] = [
  { id: 'main', label: 'Основная информация' },
  { id: 'product', label: 'Продукт и УТП' },
  { id: 'rules', label: 'Правила для авторов' },
  { id: 'terms', label: 'Условия сотрудничества' },
];

const CATS = [
  'Автомобили и транспорт', 'Бизнес, финансы и B2B', 'Здоровье и медицина',
  'Ритейл и электронная коммерция', 'Путешествия и туризм', 'Еда и напитки',
  'Развлечения, медиа и игры', 'Технологии и IT', 'Дом, семья и образ жизни',
  'Образование и карьера', 'Спорт, хобби и досуг', 'Красота, мода и уход за собой',
  'Недвижимость', 'Промышленность, строительство и сельское хозяйство',
  'Государственный сектор и НКО', 'AI сервисы', 'Другое',
];

const REQ_FIELDS: { k: keyof BrandRequisites; label: string; ph: string; wide?: boolean }[] = [
  { k: 'company', label: 'Компания (юрлицо)', ph: 'ООО «Название»', wide: true },
  { k: 'inn', label: 'ИНН', ph: '10 или 12 цифр' },
  { k: 'kpp', label: 'КПП', ph: '9 цифр' },
  { k: 'ogrn', label: 'ОГРН', ph: '13 цифр' },
  { k: 'address', label: 'Юридический адрес', ph: 'индекс, город, улица, дом', wide: true },
  { k: 'account', label: 'Расчётный счёт', ph: '20 цифр' },
  { k: 'bank', label: 'Банк', ph: 'Название банка' },
  { k: 'bik', label: 'БИК', ph: '9 цифр' },
  { k: 'correspondent_account', label: 'Корреспондентский счёт', ph: '20 цифр' },
];

const PAY_DEFAULTS: BrandPayType[] = [
  { label: 'За фиксированную оплату', on: false, rate: 'Автор назначает цену, бренд соглашается или торгуется' },
  { label: 'Фикс + просмотры', on: false, rate: 'Фиксированная оплата плюс оплата за каждую 1000 просмотров' },
  { label: 'Только за просмотры', on: false, rate: 'Оплата за каждую 1000 просмотров' },
  { label: 'Бартер', on: false, rate: 'Бренд предоставляет товар, автор создаёт и публикует контент' },
  { label: 'На постоянной основе', on: false, rate: 'Регулярная оплата, возможные бонусы и договор на выбранный срок' },
];

type Draft = {
  name: string;
  category: string;
  status: string;
  hue: number;
  desc: string;
  kb: BrandKb;
};

const toDraft = (b: BrandItem): Draft => ({
  name: b.name,
  category: b.category,
  status: b.status,
  hue: b.hue,
  desc: b.desc,
  kb: {
    short: b.kb?.short ?? '',
    products: (b.kb?.products ?? []).map(p => ({ ...p, tags: [...p.tags] })),
    usp: [...(b.kb?.usp ?? [])],
    allowed: [...(b.kb?.allowed ?? [])],
    forbidden: [...(b.kb?.forbidden ?? [])],
    mentions: [...(b.kb?.mentions ?? [])],
    pay_types: b.kb?.pay_types?.length ? b.kb.pay_types.map(p => ({ ...p })) : PAY_DEFAULTS.map(p => ({ ...p })),
    requisites: { ...(b.kb?.requisites ?? {}) },
    product_url: b.kb?.product_url ?? '',
    sku: b.kb?.sku ?? '',
    gallery: [...(b.kb?.gallery ?? [])],
  },
});

const inputCls = 'h-[42px] px-3.5 rounded-[10px] border border-line text-[14.5px] text-ink outline-none transition-shadow focus:border-brand-300 focus:ring-[3px] focus:ring-brand-100';
const areaCls = 'px-3.5 py-3 rounded-[10px] border border-line text-[14.5px] leading-relaxed text-ink outline-none resize-vertical transition-shadow focus:border-brand-300 focus:ring-[3px] focus:ring-brand-100';
const rowInputCls = 'w-full h-9 px-2 rounded-lg border-0 bg-transparent text-[14.5px] text-gray-800 outline-none hover:bg-page focus:bg-white focus:ring-2 focus:ring-brand-200';

export default function BrandEditorScreen({ brandId, onClose, onOpenRegistry }: {
  brandId: number;
  onClose: () => void;
  onOpenRegistry: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [eridRecords, setEridRecords] = useState<EridRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('main');
  const [tagFor, setTagFor] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getBrand(brandId), api.getEridRecords({ brandId })])
      .then(([b, e]) => {
        setDraft(toDraft(b));
        setEridRecords(e);
        setLoading(false);
      })
      .catch(() => {
        setError('Не удалось загрузить бренд');
        setLoading(false);
      });
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  const put = (patch: Partial<Draft>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);
  const putKb = (patch: Partial<BrandKb>) => setDraft(prev => prev ? { ...prev, kb: { ...prev.kb, ...patch } } : prev);

  const save = () => {
    if (!draft || saving) return;
    setSaving(true);
    api.updateBrand(brandId, {
      name: draft.name.trim() || 'Без названия',
      category: draft.category,
      status: draft.status,
      hue: draft.hue,
      desc: draft.desc,
      kb: draft.kb,
    })
      .then(() => { setSaving(false); toast('ok', `Бренд «${draft.name}» сохранён`); })
      .catch(() => { setSaving(false); toast('err', 'Не удалось сохранить бренд'); });
  };

  const uploadGallery = async (files: FileList | null) => {
    if (!draft || !files) return;
    const selected = Array.from(files);
    if (draft.kb.gallery.length + selected.length > 5) {
      toast('err', 'Можно загрузить не более 5 изображений');
      return;
    }
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      toast('err', 'Допустимы JPEG, PNG и WebP размером до 5 МБ');
      return;
    }
    setSaving(true);
    try {
      const uploaded = await Promise.all(selected.map(file => api.uploadChatFile(file)));
      putKb({ gallery: [...draft.kb.gallery, ...uploaded.map(item => item.media_url)] });
      toast('ok', 'Изображения загружены. Сохраните изменения');
    } catch {
      toast('err', 'Не удалось загрузить изображения');
    } finally {
      setSaving(false);
    }
  };

  const requestErid = () => {
    api.createEridRecord({ brand_id: brandId })
      .then(() => { toast('ok', 'Запрос маркировки создан'); onOpenRegistry(); })
      .catch(() => toast('err', 'Не удалось создать запрос маркировки'));
  };

  const listEditor = (key: 'usp' | 'allowed' | 'forbidden' | 'mentions', addLabel: string, addCls: string, icon: React.ReactNode) => {
    if (!draft) return null;
    const items = draft.kb[key];
    return (
      <>
        {items.map((v, i) => (
          <div key={i} className="group flex items-center gap-2">
            {icon}
            <input value={v} onChange={e => putKb({ [key]: items.map((x, j) => j === i ? e.target.value : x) })} placeholder="Новый пункт" className={rowInputCls} />
            <button type="button" onClick={() => putKb({ [key]: items.filter((_, j) => j !== i) })} aria-label="Удалить пункт"
              className="w-7 h-7 rounded-[7px] text-gray-400 flex items-center justify-center opacity-40 group-hover:opacity-100 hover:!text-red-600 hover:!bg-red-50 transition-all shrink-0">
              <X size={12} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => putKb({ [key]: [...items, ''] })} className={'mt-1.5 h-[30px] px-0 text-[13.5px] font-bold self-start ' + addCls}>{addLabel}</button>
      </>
    );
  };

  if (loading) {
    return <div className="h-full overflow-y-auto bg-page p-6"><div className="max-w-[860px] mx-auto"><SkeletonLines rows={8} /></div></div>;
  }
  if (error || !draft) {
    return <div className="h-full overflow-y-auto bg-page p-6"><div className="max-w-[860px] mx-auto"><ErrorState message={error ?? 'Бренд не найден'} onRetry={load} /></div></div>;
  }

  const active = draft.status === 'Активен';
  const letter = (draft.name || '').trim().charAt(0).toUpperCase() || '+';

  return (
    <div className="h-full flex flex-col bg-page">
      <div className="bg-white border-b border-line px-6 pt-[18px] shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-[52px] h-[52px] rounded-[14px] shrink-0 flex items-center justify-center text-[19px] font-extrabold text-white" style={{ background: `linear-gradient(135deg,hsl(${draft.hue} 70% 52%),hsl(${draft.hue + 25} 65% 38%))` }}>
            {letter}
          </span>
          <input value={draft.name} onChange={e => put({ name: e.target.value })} placeholder="Название бренда" aria-label="Название бренда"
            className="flex-1 min-w-[220px] border-0 border-b-2 border-transparent bg-transparent py-0.5 font-collab text-[22px] font-semibold text-ink outline-none focus:border-brand-300" />
          <button type="button" onClick={() => { put({ hue: (draft.hue + 70) % 360 }); toast('info', 'Цвет бренда обновлён'); }}
            className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-line bg-white text-gray-700 text-[13.5px] font-semibold hover:border-gray-300 transition-colors">
            <Upload size={15} />Цвет бренда
          </button>
          <button type="button" onClick={() => { const st = active ? 'Черновик' : 'Активен'; put({ status: st }); toast('info', 'Статус: ' + st); }} title="Переключить статус"
            className={'inline-flex items-center gap-2 h-9 px-3 rounded-[10px] text-[13.5px] font-bold border transition-colors ' + (active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-gray-100 text-gray-600')}>
            <span className={'w-2 h-2 rounded-full ' + (active ? 'bg-emerald-500' : 'bg-gray-400')} />{draft.status}
          </button>
          <Btn onClick={save} disabled={saving} className="!h-10"><Save size={15} />{saving ? 'Сохраняем…' : 'Сохранить'}</Btn>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="w-10 h-10 rounded-[10px] text-gray-500 flex items-center justify-center hover:bg-gray-100 transition-colors"><X size={17} /></button>
        </div>
        <div role="tablist" className="flex flex-wrap gap-1 mt-3">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={'h-11 px-2.5 -mb-px border-b-2 text-[13.5px] transition-colors ' + (tab === t.id ? 'border-brand-500 font-bold text-brand-600' : 'border-transparent font-semibold text-muted hover:text-ink')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-6">
        <div className="max-w-[860px] mx-auto flex flex-col gap-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13.5px] font-semibold text-brand-700">
            Следите за правильностью написания данных, так как мы их используем для автоматизации переговоров с авторами
          </div>
          {tab === 'main' && (
            <section className="bg-white border border-line rounded-2xl p-[22px] flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-[13px] font-semibold text-gray-600">Название бренда
                  <input value={draft.name} onChange={e => put({ name: e.target.value })} className={inputCls} />
                </label>
                <div className="flex flex-col gap-2 text-[13px] font-semibold text-gray-600">Категория
                  <Select options={CATS.map(c => ({ v: c, label: c }))} value={draft.category || 'Другое'} onChange={v => put({ category: v })} label="Категория" width="100%" size="md" />
                </div>
              </div>
              <label className="flex flex-col gap-2 text-[13px] font-semibold text-gray-600">Описание бренда: уникальные особенности и позиционирование
                <textarea rows={4} maxLength={5000} value={draft.desc} onChange={e => put({ desc: e.target.value })} placeholder="Чем занимается бренд, ключевые продукты" className={areaCls} />
              </label>
              <label className="flex flex-col gap-2 text-[13px] font-semibold text-gray-600">Краткое описание для авторов контента
                <textarea rows={3} maxLength={1000} value={draft.kb.short} onChange={e => putKb({ short: e.target.value })} placeholder="Коротко о бренде для автора" className={areaCls} />
              </label>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5 border-t border-line pt-4">
                {REQ_FIELDS.map(f => (
                  <label key={f.k} className={'flex flex-col gap-2 text-[13px] font-semibold text-gray-600 ' + (f.wide ? 'col-span-full' : '')}>{f.label}
                    <input value={draft.kb.requisites[f.k] ?? ''} onChange={e => putKb({ requisites: { ...draft.kb.requisites, [f.k]: e.target.value } })} placeholder={f.ph} className={inputCls + ' font-medium'} />
                  </label>
                ))}
              </div>
            </section>
          )}

          {tab === 'product' && (
            <>
              <section className="bg-white border border-line rounded-2xl p-[22px] flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-2 text-[13px] font-semibold text-gray-600">Ссылка на продукт
                    <input type="url" maxLength={2048} value={draft.kb.product_url} onChange={e => putKb({ product_url: e.target.value })} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-2 text-[13px] font-semibold text-gray-600">Артикул
                    <input maxLength={255} value={draft.kb.sku} onChange={e => putKb({ sku: e.target.value })} className={inputCls} />
                  </label>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="text-[13px] font-semibold text-gray-600">Студийные фотографии и рекламные материалы</div>
                  <div className="flex flex-wrap gap-3">
                    {draft.kb.gallery.map((url, index) => (
                      <div key={url} className="relative w-24 h-24">
                        <img src={url} alt={`Материал ${index + 1}`} className="w-24 h-24 rounded-xl object-cover border border-line" />
                        <button type="button" aria-label="Удалить изображение" onClick={() => putKb({ gallery: draft.kb.gallery.filter((_, i) => i !== index) })} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-white border border-line text-gray-500 flex items-center justify-center"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                  {draft.kb.gallery.length < 5 && (
                    <label className="self-start inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-brand-200 text-brand-600 text-[13px] font-bold cursor-pointer">
                      <Upload size={15} />Загрузить изображения
                      <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { void uploadGallery(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                  {draft.kb.gallery.length === 0 && <div className="text-[13px] text-muted">Загрузите до 5 изображений</div>}
                </div>
              </section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-[15px] font-bold text-ink">Карточки продуктов</h3>
                <button type="button" onClick={() => { putKb({ products: [...draft.kb.products, { name: 'Новый продукт', desc: '', tags: [], hue: (draft.hue + 40 * (draft.kb.products.length + 1)) % 360 }] }); }}
                  className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-[10px] border border-brand-200 bg-white text-brand-600 text-[13.5px] font-bold hover:bg-brand-50 transition-colors">
                  <Plus size={14} />Добавить продукт
                </button>
              </div>
              {draft.kb.products.length === 0 && (
                <div className="p-7 rounded-2xl border-[1.5px] border-dashed border-[#d6d8e3] text-center text-[13.5px] text-muted">Продуктов пока нет — добавьте первый, авторы увидят его в брифе</div>
              )}
              {draft.kb.products.map((p, i) => (
                <article key={i} className="bg-white border border-line rounded-2xl p-4 flex gap-4">
                  <span aria-hidden="true" className="w-[92px] h-[92px] shrink-0 rounded-[14px] shadow-md" style={{ background: `radial-gradient(circle at 30% 25%,hsl(${p.hue} 80% 92%),hsl(${p.hue + 20} 60% 62%) 60%,hsl(${p.hue + 30} 55% 45%))` }} />
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input value={p.name} aria-label="Название продукта" onChange={e => putKb({ products: draft.kb.products.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })}
                        className="flex-1 h-10 px-3 rounded-[10px] border border-line text-[14.5px] font-bold text-ink outline-none focus:border-brand-300 focus:ring-[3px] focus:ring-brand-100" />
                      <button type="button" onClick={() => putKb({ products: draft.kb.products.filter((_, j) => j !== i) })} aria-label="Удалить продукт"
                        className="w-9 h-9 rounded-lg text-gray-400 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <textarea rows={2} value={p.desc} aria-label="Описание продукта" onChange={e => putKb({ products: draft.kb.products.map((x, j) => j === i ? { ...x, desc: e.target.value } : x) })}
                      placeholder="Коротко о продукте" className="w-full px-3 py-2.5 rounded-[10px] border border-line text-[14px] leading-normal text-ink outline-none resize-vertical focus:border-brand-300 focus:ring-[3px] focus:ring-brand-100" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.tags.map((t, k) => (
                        <span key={k} className="inline-flex items-center gap-1 h-[30px] pl-2.5 pr-1 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-[13px] font-semibold">
                          {t}
                          <button type="button" onClick={() => putKb({ products: draft.kb.products.map((x, j) => j === i ? { ...x, tags: x.tags.filter((_, m) => m !== k) } : x) })} aria-label="Убрать тег"
                            className="w-5 h-5 rounded-[5px] text-brand-400 flex items-center justify-center hover:text-brand-700">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      {tagFor === i ? (
                        <span className="inline-flex items-center gap-1">
                          <input value={tagDraft} onChange={e => setTagDraft(e.target.value)} placeholder="Новый тег" autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const t = tagDraft.trim();
                                if (t) putKb({ products: draft.kb.products.map((x, j) => j === i ? { ...x, tags: [...x.tags, t] } : x) });
                                setTagFor(null); setTagDraft('');
                              } else if (e.key === 'Escape') setTagFor(null);
                            }}
                            className="w-[140px] h-[30px] px-2.5 rounded-lg border border-brand-300 text-[13px] outline-none" />
                          <button type="button" onClick={() => {
                            const t = tagDraft.trim();
                            if (t) putKb({ products: draft.kb.products.map((x, j) => j === i ? { ...x, tags: [...x.tags, t] } : x) });
                            setTagFor(null); setTagDraft('');
                          }} className="h-[30px] px-2.5 rounded-lg bg-brand-600 text-white text-[12.5px] font-bold">Добавить</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => { setTagFor(i); setTagDraft(''); }} className="h-[30px] px-1.5 text-brand-600 text-[13px] font-bold">+ тег</button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              <section className="bg-white border border-line rounded-2xl px-5 py-[18px] flex flex-col">
                <h3 className="m-0 mb-2 text-[12px] font-bold tracking-wider uppercase text-gray-400">Уникальные торговые предложения (УТП)</h3>
                {listEditor('usp', '+ Добавить', 'text-brand-600', <Check size={15} className="text-brand-500 shrink-0" />)}
              </section>
            </>
          )}

          {tab === 'rules' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="bg-white border border-line rounded-2xl px-5 py-[18px] flex flex-col">
                  <h3 className="m-0 mb-2 flex items-center gap-2 text-[13px] font-extrabold tracking-wide uppercase text-emerald-700"><Check size={15} className="text-emerald-500" />Что можно говорить</h3>
                  {listEditor('allowed', '+ Добавить пункт', 'text-emerald-600', <Check size={14} className="text-emerald-500 shrink-0" />)}
                </section>
                <section className="bg-white border border-red-200 rounded-2xl px-5 py-[18px] flex flex-col">
                  <h3 className="m-0 mb-2 flex items-center gap-2 text-[13px] font-extrabold tracking-wide uppercase text-red-600"><X size={14} className="text-red-500" />Что запрещено</h3>
                  {listEditor('forbidden', '+ Добавить запрет', 'text-red-600', <X size={13} className="text-red-500 shrink-0" />)}
                </section>
              </div>
              <section className="bg-white border border-line rounded-2xl px-5 py-[18px] flex flex-col">
                <h3 className="m-0 mb-2 text-[12px] font-bold tracking-wider uppercase text-gray-400">Обязательные упоминания</h3>
                {listEditor('mentions', '+ Добавить упоминание', 'text-brand-600', <Check size={14} className="text-brand-500 shrink-0" />)}
                <div className="mt-2 text-[12.5px] text-gray-400">Включая требования 38-ФЗ «О рекламе» и Роскомнадзора</div>
              </section>
            </>
          )}

          {tab === 'terms' && (
            <>
              {draft.kb.pay_types.map((pt, i) => {
                const upd = (patch: Partial<BrandPayType>) => putKb({ pay_types: draft.kb.pay_types.map((x, j) => j === i ? { ...x, ...patch } : x) });
                return (
                  <div key={i} className={'flex items-center gap-[18px] px-5 py-[18px] rounded-2xl ' + (pt.on ? 'bg-white border border-brand-200' : 'bg-[#fcfcfd] border border-[#eef0f4]')}>
                    <button type="button" role="switch" aria-checked={pt.on} aria-label={pt.label} onClick={() => upd({ on: !pt.on })}
                      className={'shrink-0 relative w-[46px] h-[26px] rounded-full border transition-colors ' + (pt.on ? 'border-brand-500 bg-brand-500' : 'border-line bg-[#eceef3]')}>
                      <span className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: pt.on ? 22 : 2 }} />
                    </button>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {pt.custom ? (
                          <input value={pt.label} onChange={e => upd({ label: e.target.value })} placeholder="Название типа оплаты"
                            className="w-[280px] max-w-full h-[34px] px-2.5 rounded-lg border border-line text-[14.5px] font-bold text-ink outline-none focus:border-brand-300" />
                        ) : (
                          <span className={'text-[15px] font-bold ' + (pt.on ? 'text-ink' : 'text-muted')}>{pt.on ? `${i + 1}. ` : ''}{pt.label}</span>
                        )}
                        {pt.def && pt.on && <span className="text-[12.5px] font-bold px-[9px] py-[3px] rounded-[7px] border border-brand-200 bg-brand-50 text-brand-700">по умолчанию</span>}
                      </div>
                      {pt.on && (
                        <textarea rows={3} maxLength={2000} value={pt.rate} onChange={e => upd({ rate: e.target.value })} placeholder="Описание условий сотрудничества"
                          className={areaCls + ' w-full'} />
                      )}
                    </div>
                    {pt.on && (
                      <div className="flex flex-col gap-1">
                        <button type="button" disabled={i === 0} aria-label="Вверх" onClick={() => { const items = [...draft.kb.pay_types]; [items[i - 1], items[i]] = [items[i], items[i - 1]]; putKb({ pay_types: items }); }} className="w-8 h-8 rounded-lg border border-line flex items-center justify-center disabled:opacity-30"><ArrowUp size={14} /></button>
                        <button type="button" disabled={i === draft.kb.pay_types.length - 1} aria-label="Вниз" onClick={() => { const items = [...draft.kb.pay_types]; [items[i + 1], items[i]] = [items[i], items[i + 1]]; putKb({ pay_types: items }); }} className="w-8 h-8 rounded-lg border border-line flex items-center justify-center disabled:opacity-30"><ArrowDown size={14} /></button>
                      </div>
                    )}
                    {pt.on && !pt.def && (
                      <button type="button" onClick={() => putKb({ pay_types: draft.kb.pay_types.map((x, j) => ({ ...x, def: j === i })) })}
                        className="h-[34px] px-2.5 rounded-lg text-gray-600 text-[13.5px] font-semibold hover:bg-gray-100">По умолчанию</button>
                    )}
                    {pt.custom && (
                      <button type="button" onClick={() => putKb({ pay_types: draft.kb.pay_types.filter((_, j) => j !== i) })} aria-label="Удалить тип оплаты"
                        className="w-9 h-9 rounded-lg text-gray-400 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors shrink-0">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
              {draft.kb.pay_types.length === 0 && <Empty title="Типов оплаты нет" text="Добавьте первый тип оплаты для авторов" />}
              <button type="button" onClick={() => putKb({ pay_types: [...draft.kb.pay_types, { label: '', on: true, rate: '', custom: true }] })}
                className="self-start inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[10px] border border-brand-200 bg-white text-brand-600 text-[13.5px] font-bold hover:bg-brand-50 transition-colors">
                <Plus size={14} />Добавить тип оплаты
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
