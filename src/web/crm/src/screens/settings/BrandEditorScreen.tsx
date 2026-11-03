import { ArrowDown, ArrowUp, Check, Image, Lock, Maximize2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
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
    products: (b.kb?.products ?? []).map((p, index) => ({
      ...p,
      tags: [...p.tags],
      product_url: p.product_url ?? (index === 0 ? b.kb?.product_url ?? '' : ''),
      sku: p.sku ?? (index === 0 ? b.kb?.sku ?? '' : ''),
      logo_url: p.logo_url ?? '',
      gallery: [...(p.gallery ?? (index === 0 ? b.kb?.gallery ?? [] : []))],
      selected_image: p.selected_image ?? '',
    })),
    usp: [...(b.kb?.usp ?? [])],
    allowed: [...(b.kb?.allowed ?? [])],
    forbidden: [...(b.kb?.forbidden ?? [])],
    mentions: [...(b.kb?.mentions ?? [])],
    pay_types: b.kb?.pay_types?.length ? b.kb.pay_types.map(p => ({ ...p })) : PAY_DEFAULTS.map(p => ({ ...p })),
    requisites: { ...(b.kb?.requisites ?? {}) },
    logo_url: b.kb?.logo_url ?? '',
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
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('main');
  const [tagFor, setTagFor] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [galleryFor, setGalleryFor] = useState<number | null>(null);

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
    if (!draft || saving || uploading) return;
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

  const putProduct = (index: number, patch: Partial<BrandProduct>) => {
    if (!draft) return;
    putKb({ products: draft.kb.products.map((product, i) => i === index ? { ...product, ...patch } : product) });
  };

  const uploadFiles = async (files: FileList | null): Promise<string[] | null> => {
    if (!files || !files.length || uploading) return null;
    const selected = Array.from(files);
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      toast('err', 'Допустимы JPEG, PNG и WebP размером до 5 МБ');
      return null;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(selected.map(file => api.uploadChatFile(file)));
      return uploaded.map(item => item.media_url);
    } catch {
      toast('err', 'Не удалось загрузить изображения');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadGallery = async (index: number, files: FileList | null) => {
    if (!draft || !files) return;
    const product = draft.kb.products[index];
    if (product.gallery.length + files.length > 5) {
      toast('err', 'Можно загрузить не более 5 изображений для одного продукта');
      return;
    }
    const uploaded = await uploadFiles(files);
    if (!uploaded) return;
    const selectedImage = product.selected_image || uploaded[0] || '';
    putProduct(index, { gallery: [...product.gallery, ...uploaded], selected_image: selectedImage, logo_url: selectedImage });
    toast('ok', 'Изображения загружены. Сохраните изменения');
  };

  const uploadLogo = async (files: FileList | null) => {
    if (!draft || !files?.length) return;
    const uploaded = await uploadFiles(files);
    if (!uploaded?.[0]) return;
    putKb({ logo_url: uploaded[0] });
    toast('ok', 'Логотип бренда загружен. Сохраните изменения');
  };

  const togglePayType = (index: number) => {
    if (!draft) return;
    putKb({
      pay_types: draft.kb.pay_types.map((item, i) => i === index
        ? { ...item, on: !item.on, def: item.on ? false : item.def }
        : item),
    });
  };

  const toggleDefault = (index: number) => {
    if (!draft) return;
    const selected = draft.kb.pay_types[index];
    if (selected.def) {
      putKb({ pay_types: draft.kb.pay_types.map(item => ({ ...item, def: false })) });
      return;
    }
    putKb({
      pay_types: [
        { ...selected, on: true, def: true },
        ...draft.kb.pay_types.filter((_, i) => i !== index).map(item => ({ ...item, def: false })),
      ],
    });
  };

  const movePayType = (index: number, offset: number) => {
    if (!draft) return;
    const target = index + offset;
    const items = [...draft.kb.pay_types];
    if (target < 0 || target >= items.length || items[index].def || items[target].def) return;
    [items[index], items[target]] = [items[target], items[index]];
    putKb({ pay_types: items });
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
  const galleryProduct = galleryFor === null ? null : draft.kb.products[galleryFor] ?? null;

  return (
    <div className="h-full flex flex-col bg-page">
      <div className="bg-white border-b border-line px-6 pt-[18px] shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-[52px] h-[52px] rounded-[14px] shrink-0 flex items-center justify-center overflow-hidden text-[19px] font-extrabold text-white" style={{ background: `linear-gradient(135deg,hsl(${draft.hue} 70% 52%),hsl(${draft.hue + 25} 65% 38%))` }}>
            {draft.kb.logo_url ? <img src={draft.kb.logo_url} alt="Логотип бренда" className="w-full h-full object-cover" /> : letter}
          </span>
          <input value={draft.name} onChange={e => put({ name: e.target.value })} placeholder="Название бренда" aria-label="Название бренда"
            className="flex-1 min-w-[220px] border-0 border-b-2 border-transparent bg-transparent py-0.5 font-collab text-[22px] font-semibold text-ink outline-none focus:border-brand-300" />
          <label className={'inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-brand-200 bg-white text-brand-600 text-[13.5px] font-semibold transition-colors ' + (uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-brand-50')}>
            <Upload size={15} />{uploading ? 'Загружаем…' : draft.kb.logo_url ? 'Заменить логотип' : 'Логотип бренда'}
            <input type="file" disabled={uploading} accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { void uploadLogo(e.target.files); e.target.value = ''; }} />
          </label>
          <button type="button" onClick={() => { put({ hue: (draft.hue + 70) % 360 }); toast('info', 'Цвет бренда обновлён'); }}
            className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-line bg-white text-gray-700 text-[13.5px] font-semibold hover:border-gray-300 transition-colors">
            <Upload size={15} />Цвет бренда
          </button>
          <button type="button" onClick={() => { const st = active ? 'Черновик' : 'Активен'; put({ status: st }); toast('info', 'Статус: ' + st); }} title="Переключить статус"
            className={'inline-flex items-center gap-2 h-9 px-3 rounded-[10px] text-[13.5px] font-bold border transition-colors ' + (active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-gray-100 text-gray-600')}>
            <span className={'w-2 h-2 rounded-full ' + (active ? 'bg-emerald-500' : 'bg-gray-400')} />{draft.status}
          </button>
          <Btn onClick={save} disabled={saving || uploading} className="!h-10"><Save size={15} />{saving ? 'Сохраняем…' : 'Сохранить'}</Btn>
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-[15px] font-bold text-ink">Карточки продуктов</h3>
                <button type="button" onClick={() => { putKb({ products: [...draft.kb.products, { name: 'Новый продукт', desc: '', tags: [], hue: (draft.hue + 40 * (draft.kb.products.length + 1)) % 360, product_url: '', sku: '', logo_url: '', gallery: [], selected_image: '' }] }); }}
                  className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-[10px] border border-brand-200 bg-white text-brand-600 text-[13.5px] font-bold hover:bg-brand-50 transition-colors">
                  <Plus size={14} />Добавить продукт
                </button>
              </div>
              {draft.kb.products.length === 0 && (
                <div className="p-7 rounded-2xl border-[1.5px] border-dashed border-[#d6d8e3] text-center text-[13.5px] text-muted">Продуктов пока нет — добавьте первый, авторы увидят его в брифе</div>
              )}
              {draft.kb.products.map((p, i) => (
                <article key={i} className="bg-white border border-line rounded-2xl p-4 flex gap-4">
                  <div className="w-[92px] shrink-0 flex flex-col gap-2">
                    <span className="w-[92px] h-[92px] rounded-[14px] shadow-md overflow-hidden flex items-center justify-center" style={{ background: `radial-gradient(circle at 30% 25%,hsl(${p.hue} 80% 92%),hsl(${p.hue + 20} 60% 62%) 60%,hsl(${p.hue + 30} 55% 45%))` }}>
                      {(p.selected_image || p.logo_url) && <img src={p.selected_image || p.logo_url} alt={`Изображение продукта ${p.name}`} className="w-full h-full object-cover" />}
                    </span>
                    <button type="button" onClick={() => setGalleryFor(i)} className="inline-flex items-center justify-center gap-1 min-h-8 px-1 rounded-lg border border-brand-200 text-brand-600 text-[11px] font-bold text-center hover:bg-brand-50">
                      <Upload size={12} />{p.selected_image || p.logo_url ? 'Сменить логотип' : 'Логотип'}
                    </button>
                  </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-gray-600">Ссылка на продукт
                        <input type="url" maxLength={2048} value={p.product_url} onChange={e => putProduct(i, { product_url: e.target.value })} className={inputCls} />
                      </label>
                      <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-gray-600">Артикул
                        <input maxLength={255} value={p.sku} onChange={e => putProduct(i, { sku: e.target.value })} className={inputCls} />
                      </label>
                    </div>

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
              <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13.5px] font-semibold text-brand-700">
                Порядок типов оплаты определяет их приоритет: чем выше тип оплаты, тем выше приоритет
              </div>
              {draft.kb.pay_types.map((pt, i) => {
                const upd = (patch: Partial<BrandPayType>) => putKb({ pay_types: draft.kb.pay_types.map((x, j) => j === i ? { ...x, ...patch } : x) });
                const canMoveUp = !pt.def && i > 0 && !draft.kb.pay_types[i - 1]?.def;
                const canMoveDown = !pt.def && i < draft.kb.pay_types.length - 1 && !draft.kb.pay_types[i + 1]?.def;
                return (
                  <div key={i} className={'flex items-center gap-[18px] px-5 py-[18px] rounded-2xl ' + (pt.on ? 'bg-white border border-brand-200' : 'bg-[#fcfcfd] border border-[#eef0f4]')}>
                    <button type="button" role="switch" aria-checked={pt.on} aria-label={pt.label} onClick={() => togglePayType(i)}
                      className={'shrink-0 relative w-[46px] h-[26px] rounded-full border transition-colors ' + (pt.on ? 'border-brand-500 bg-brand-500' : 'border-line bg-[#eceef3]')}>
                      <span className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: pt.on ? 22 : 2 }} />
                    </button>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-bold text-muted tabular-nums">{i + 1}.</span>
                        {pt.custom ? (
                          <input value={pt.label} onChange={e => upd({ label: e.target.value })} placeholder="Название типа оплаты"
                            className="w-[280px] max-w-full h-[34px] px-2.5 rounded-lg border border-line text-[14.5px] font-bold text-ink outline-none focus:border-brand-300" />
                        ) : (
                          <span className={'text-[15px] font-bold ' + (pt.on ? 'text-ink' : 'text-muted')}>{pt.label}</span>
                        )}
                        {pt.def && pt.on && (
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-bold px-[9px] py-[3px] rounded-[7px] border border-brand-200 bg-brand-50 text-brand-700">
                            <Lock size={12} />по умолчанию · порядок закреплён
                          </span>
                        )}
                      </div>
                      {pt.on && (
                        <textarea rows={3} maxLength={2000} value={pt.rate} onChange={e => upd({ rate: e.target.value })} placeholder="Описание условий сотрудничества"
                          className={areaCls + ' w-full'} />
                      )}
                    </div>
                    {pt.on && (
                      <div className="flex flex-col gap-1" title={pt.def ? 'Снимите статус «По умолчанию», чтобы переместить тип оплаты' : undefined}>
                        <button type="button" disabled={!canMoveUp} aria-label="Вверх" onClick={() => movePayType(i, -1)} className="w-8 h-8 rounded-lg border border-line flex items-center justify-center disabled:opacity-30"><ArrowUp size={14} /></button>
                        <button type="button" disabled={!canMoveDown} aria-label="Вниз" onClick={() => movePayType(i, 1)} className="w-8 h-8 rounded-lg border border-line flex items-center justify-center disabled:opacity-30"><ArrowDown size={14} /></button>
                      </div>
                    )}
                    {pt.on && (
                      <button type="button" aria-pressed={pt.def === true} onClick={() => toggleDefault(i)}
                        className="h-[34px] px-2.5 rounded-lg text-gray-600 text-[13.5px] font-semibold hover:bg-gray-100 whitespace-nowrap">
                        {pt.def ? 'Снять по умолчанию' : 'По умолчанию'}
                      </button>
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
      {galleryFor !== null && galleryProduct && (
        <div role="dialog" aria-modal="true" aria-label={`Логотип продукта ${galleryProduct.name}`} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setGalleryFor(null); }} onKeyDown={e => { if (e.key === 'Escape') setGalleryFor(null); }}>
          <div className="w-full max-w-[680px] max-h-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="m-0 text-[18px] font-bold text-ink">Логотип продукта · {galleryProduct.gallery.length}/5</h3>
                <p className="m-0 mt-1 text-[13px] text-muted">Загрузите до 5 изображений и выберите логотип карточки</p>
              </div>
              <button type="button" autoFocus aria-label="Закрыть галерею" onClick={() => setGalleryFor(null)} className="w-9 h-9 rounded-lg text-gray-500 flex items-center justify-center hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="relative w-full aspect-[16/8] min-h-[180px] rounded-xl overflow-hidden bg-page flex items-center justify-center">
              {galleryProduct.selected_image || galleryProduct.logo_url ? (
                <>
                  <img src={galleryProduct.selected_image || galleryProduct.logo_url} alt={`Логотип продукта ${galleryProduct.name}`} className="w-full h-full object-contain" />
                  <button type="button" aria-label="Увеличить изображение" onClick={() => setPreviewImage(galleryProduct.selected_image || galleryProduct.logo_url)} className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/95 border border-line text-gray-700 text-[12px] font-bold shadow-sm"><Maximize2 size={14} />Увеличить</button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted"><Image size={30} /><span className="text-[13px]">Загрузите первое изображение</span></div>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2.5">
              {galleryProduct.gallery.map((url, imageIndex) => {
                const selected = (galleryProduct.selected_image || galleryProduct.logo_url) === url;
                return (
                  <div key={`${url}-${imageIndex}`} className={'relative rounded-lg border-2 ' + (selected ? 'border-brand-500' : 'border-transparent')}>
                    <button type="button" aria-label={`Увеличить изображение ${imageIndex + 1}`} onClick={() => setPreviewImage(url)} className="w-full aspect-square rounded-md overflow-hidden bg-page">
                      <img src={url} alt={`Изображение продукта ${imageIndex + 1}`} className="w-full h-full object-cover" />
                    </button>
                    <button type="button" aria-label={`Выбрать логотип ${imageIndex + 1}`} aria-pressed={selected} onClick={() => putProduct(galleryFor, { selected_image: url, logo_url: url })} className="absolute inset-x-1 bottom-1 min-h-6 px-1 rounded-md bg-white/95 border border-line text-brand-700 text-[10px] font-bold shadow-sm flex items-center justify-center gap-1">
                      {selected && <Check size={11} />}{selected ? 'Логотип' : 'Выбрать'}
                    </button>
                    <button type="button" aria-label={`Удалить изображение ${imageIndex + 1}`} onClick={() => { const gallery = galleryProduct.gallery.filter((_, index) => index !== imageIndex); const selectedImage = selected ? gallery[0] ?? '' : galleryProduct.selected_image; putProduct(galleryFor, { gallery, selected_image: selectedImage, logo_url: selectedImage }); }} className="absolute -right-1.5 -top-1.5 w-6 h-6 rounded-full bg-white border border-line text-gray-500 flex items-center justify-center shadow-sm"><X size={11} /></button>
                  </div>
                );
              })}
              {galleryProduct.gallery.length < 5 && (
                <label className={'aspect-square rounded-lg border-[1.5px] border-dashed border-brand-200 text-brand-600 flex flex-col items-center justify-center gap-1 text-[11px] font-bold ' + (uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-brand-50')}>
                  <Upload size={17} />{uploading ? 'Загружаем…' : 'Загрузить'}
                  <input type="file" multiple disabled={uploading} accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { void uploadGallery(galleryFor, e.target.files); e.target.value = ''; }} />
                </label>
              )}
              {Array.from({ length: Math.max(0, 4 - galleryProduct.gallery.length) }, (_, placeholderIndex) => (
                <div key={`empty-${placeholderIndex}`} className="aspect-square rounded-lg border border-dashed border-line bg-page flex items-center justify-center text-gray-300"><Image size={16} /></div>
              ))}
            </div>
            <div role="status" aria-live="polite" className={'text-[12px] ' + (galleryProduct.gallery.length >= 5 ? 'font-semibold text-amber-700' : 'text-muted')}>
              {galleryProduct.gallery.length >= 5
                ? 'Достигнут лимит: 5 изображений. Удалите одно, чтобы загрузить другое.'
                : 'Нажмите на миниатюру для полноразмерного просмотра или кнопку «Выбрать», чтобы назначить логотип. Сохраните изменения в редакторе бренда.'}
            </div>
          </div>
        </div>
      )}
      {previewImage && (
        <div role="dialog" aria-modal="true" aria-label="Увеличенное изображение продукта" className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-5" onClick={e => { if (e.target === e.currentTarget) setPreviewImage(null); }} onKeyDown={e => { if (e.key === 'Escape') setPreviewImage(null); }}>
          <button type="button" autoFocus aria-label="Закрыть увеличенное изображение" onClick={() => setPreviewImage(null)} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-lg"><X size={20} /></button>
          <img src={previewImage} alt="Увеличенное изображение продукта" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}
