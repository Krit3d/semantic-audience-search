import React from "react";
import { I } from "./icons.jsx";
// Reusable product-style mockup components.
// They are static (no real backend), but feel like real UI surfaces.

const platformIcon = () => <I.Dot size={14} />;

// — Avatar with initials + soft brand-toned gradient —
const Avatar = ({ name, size = 36, hue = 250 }) => {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const bg = `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue+40)%360} 70% 55%))`;
  return (
    <div
      className="rounded-full text-white font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36, letterSpacing: '0.02em' }}
    >
      {initials}
    </div>
  );
};

// — Photo avatar with a soft brand-toned ring —
const PlatformAvatar = ({ photo, name, platform, size = 30 }) => {
  const rings = {
    'Канал': 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'Видео': 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
    'Блог':  'linear-gradient(135deg,#3b82f6,#6366f1)',
  };
  const ring = rings[platform] || 'linear-gradient(135deg,#6366f1,#8b5cf6)';
  return (
    <span className="shrink-0 rounded-full block" style={{ background: ring, padding: 2 }}>
      <img src={`https://i.pravatar.cc/120?img=${photo}`} alt={name}
           className="rounded-full object-cover block border-2 border-white"
           style={{ width: size, height: size }} />
    </span>
  );
};

// — Tiny sparkline path for "ER" / audience trends —
const Spark = ({ data = [4,6,5,7,8,7,9,11,10,12], w = 64, h = 22, accent = true }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke={accent ? "var(--accent)" : "#aeb2c0"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
};

// — Creator card (used in hero mockup + mock results) —
const CreatorCard = ({ c, compact = false }) => (
  <div className="card-soft p-4 flex flex-col gap-3">
    <div className="flex items-start gap-3">
      <Avatar name={c.name} hue={c.hue} size={42} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-ink-900 truncate">{c.name}</div>
          <span className="chip chip-accent" style={{padding:'2px 8px', fontSize:11}}>
            {c.relevance}%
          </span>
        </div>
        <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1">{platformIcon(c.platform)} {c.platform}</span>
          <span className="text-ink-200">·</span>
          <span className="truncate">{c.niche}</span>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2 text-[11px]">
      <Metric label="Аудитория" value={c.audience} />
      <Metric label="ER" value={c.er} spark={c.spark} />
      <Metric label="Цена" value={c.price} />
    </div>

    {!compact && (
      <div className="flex items-center justify-between pt-2 border-t border-ink-100">
        <div className="text-[11px] text-ink-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{background: c.statusColor || 'var(--accent)'}} />
          {c.status}
        </div>
        <button className="text-[12px] font-medium accent-text hover:underline">
          Добавить в shortlist
        </button>
      </div>
    )}
  </div>
);

const Metric = ({ label, value, spark }) => (
  <div className="rounded-lg bg-ink-50/70 px-2.5 py-2">
    <div className="mono-mini" style={{fontSize:10}}>{label}</div>
    <div className="flex items-center justify-between gap-1 mt-0.5">
      <div className="font-semibold text-ink-900 text-[12px]">{value}</div>
      {spark && <Spark data={spark} w={36} h={14} />}
    </div>
  </div>
);

// — Hero search-panel mockup: product-feeling surface (compact) —
const HeroProductMockup = () => {
  const creators = [
    { name:'Аня Соколова', handle:'@sokolova.skin', platform:'Канал', niche:'косметика · уход', audience:'128K', er:'8.4%', relevance:92, photo:47 },
    { name:'Кирилл Дёмин', handle:'@demin.finds', platform:'Видео', niche:'находки с маркетплейсов', audience:'214K', er:'11.2%', relevance:89, photo:12 },
    { name:'Лена Верещагина', handle:'@lenavereshchagina', platform:'Блог', niche:'обзоры · lifestyle', audience:'76K', er:'6.9%', relevance:84, photo:45 },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[40px] opacity-50 pointer-events-none"
           style={{background:'radial-gradient(closest-side, color-mix(in oklch, var(--accent) 30%, transparent), transparent 70%)'}} />
      <div className="relative card p-3.5 sm:p-4">
        {/* search query */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-ink-50 border border-ink-100">
          <I.Search size={14} className="text-ink-500" />
          <div className="flex-1 text-[12.5px] text-ink-700 truncate">
            <span className="text-ink-400">Запрос: </span>
            Косметика · WB · ж 25–40 · обзор · до 50K
          </div>
          <span className="chip" style={{padding:'2px 8px', fontSize:11}}>
            <I.Sparkle size={11} className="accent-text" /> AI
          </span>
        </div>

        {/* 3 compact creator rows */}
        <div className="mt-3 space-y-1.5">
          {creators.map((c, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-2.5 py-2">
              <PlatformAvatar photo={c.photo} name={c.name} platform={c.platform} size={30} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-[12.5px] font-semibold text-ink-900 truncate">{c.name}</div>
                  <span className="chip chip-accent" style={{padding:'1px 6px', fontSize:10}}>{c.relevance}%</span>
                </div>
                <div className="text-[10.5px] text-ink-500 truncate flex items-center gap-1">
                  {platformIcon(c.platform)} {c.handle} · {c.niche}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-semibold text-ink-900 leading-tight">{c.audience}</div>
                <div className="text-[10px] text-ink-500">ER {c.er}</div>
              </div>
            </div>
          ))}
        </div>

        {/* footer microstrip */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-ink-500">
          <div className="flex items-center gap-1.5">
            <I.Sparkle size={11} className="accent-text" />
            <span>126 авторов · 14 секунд</span>
          </div>
          <span className="inline-flex items-center gap-1 accent-text font-medium">
            Открыть воронку <I.Arrow size={11} />
          </span>
        </div>
      </div>
    </div>
  );
};

// — Mass outreach / chat mockup (UTP3) —
const OutreachMockup = () => {
  const threads = [
    { name:'Beauty Notes', platform:'Канал', hue:280, status:'в переговорах', statusColor:'var(--accent)',
      last:'Готовы по бартеру + 10K. Нужно ТЗ.', time:'14:22', unread:2 },
    { name:'Market Finds', platform:'Видео', hue:230, status:'согласовано', statusColor:'#10b981',
      last:'Окей по 35K, выход 12.06.', time:'13:48' },
    { name:'Home & Beauty', platform:'Блог', hue:320, status:'follow-up', statusColor:'#f59e0b',
      last:'Напомнить про статистику', time:'12:10' },
    { name:'Real Talk', platform:'Канал', hue:200, status:'ответил', statusColor:'var(--accent)',
      last:'Пришлите бриф + продукт', time:'11:32', unread:1 },
  ];
  const msgs = [
    { from:'us', text:'Привет! Делаем запуск нового SKU косметики на WB — ваш формат обзоров отлично заходит нашей аудитории.', time:'14:02' },
    { from:'them', text:'Привет. Скиньте продукт и условия — посмотрю.', time:'14:08' },
    { from:'us', text:'Бренд: уход для чувствительной кожи. Бюджет — фикс до 30K или бартер + 10K. Формат — обзор + сторис.', time:'14:09' },
    { from:'them', text:'Готовы по бартеру + 10K. Нужно ТЗ и дату.', time:'14:22' },
  ];
  return (
    <div className="card overflow-hidden grid grid-cols-1 md:grid-cols-[260px_1fr]">
      {/* threads */}
      <div className="border-b md:border-b-0 md:border-r border-ink-100 bg-ink-50/40">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-ink-100">
          <I.Chat size={14} className="accent-text" />
          <div className="text-[13px] font-semibold">Переговоры</div>
          <span className="ml-auto chip chip-accent" style={{padding:'2px 8px', fontSize:11}}>38 / 126</span>
        </div>
        <div className="divide-soft">
          {threads.map((t, i) => (
            <div key={i} className={`px-3.5 py-3 flex items-start gap-3 cursor-default ${i===0 ? 'bg-white' : ''}`}>
              <Avatar name={t.name} hue={t.hue} size={32} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-[13px] font-semibold text-ink-900 truncate">{t.name}</div>
                  <span className="text-[10px] text-ink-400 ml-auto">{t.time}</span>
                </div>
                <div className="text-[11px] text-ink-500 truncate mt-0.5">{t.last}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:t.statusColor}}/>
                  <span className="text-[10px] text-ink-500">{t.status}</span>
                  {t.unread && (
                    <span className="ml-auto text-[10px] font-semibold accent-bg text-white rounded-full px-1.5 leading-[16px]">{t.unread}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* conversation */}
      <div className="flex flex-col">
        <div className="px-5 py-3 border-b border-ink-100 flex items-center gap-3">
          <Avatar name="Beauty Notes" hue={280} size={36} />
          <div>
            <div className="text-[14px] font-semibold">Beauty Notes</div>
            <div className="text-[11px] text-ink-500 flex items-center gap-1.5">
              косметика · 128K · ER 8.4%
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="chip chip-accent" style={{padding:'2px 8px', fontSize:11}}><I.Sparkle size={11}/> авто follow-up</span>
          </div>
        </div>

        <div className="p-5 space-y-3 bg-gradient-to-b from-white to-ink-50/40 min-h-[260px]">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.from==='us' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] text-[13px] leading-relaxed px-3.5 py-2.5 rounded-2xl border
                ${m.from==='us'
                  ? 'text-white border-transparent rounded-br-md'
                  : 'bg-white text-ink-800 border-ink-100 rounded-bl-md'}`}
                style={m.from==='us' ? {background:'var(--accent)'} : null}
              >
                {m.text}
                <div className={`text-[10px] mt-1 ${m.from==='us' ? 'text-white/70' : 'text-ink-400'}`}>{m.time}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-100 p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {['Запросить статистику','Уточнить цену','Прислать ТЗ','Согласовать дату'].map((s,i)=>(
              <button key={i} className="chip hover:bg-white" style={{padding:'5px 10px', fontSize:11}}>
                <I.Sparkle size={10} className="accent-text"/> {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-ink-50 border border-ink-100 px-3 py-2">
            <I.Sparkle size={14} className="accent-text"/>
            <div className="flex-1 text-[12.5px] text-ink-500">Подготовлен персональный ответ — отправить 14 авторам</div>
            <button className="btn-primary px-3 py-1.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5">
              <I.Send size={12}/> Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// — CRM pipeline kanban (UTP4) —
const PipelineMockup = () => {
  const cols = [
    { title:'Найдены', count: 126, cards:[
      { name:'Soft Skin Diary', platform:'Канал', niche:'beauty', rel:91, hue:290, next:'отправить first touch' },
      { name:'Daily Wishlist',  platform:'Видео',   niche:'beauty UGC', rel:88, hue:240 },
    ]},
    { title:'Shortlist', count: 42, cards:[
      { name:'Beauty Notes',    platform:'Канал', niche:'уход', rel:92, hue:280, price:'фикс/бартер' },
      { name:'Market Finds',    platform:'Видео',   niche:'WB-находки', rel:89, hue:230, price:'≤ 40K' },
      { name:'Home & Beauty',   platform:'Блог',niche:'обзоры', rel:84, hue:320, price:'бартер + промо' },
    ]},
    { title:'Сообщение отправлено', count: 38, cards:[
      { name:'Glow Letters',    platform:'Канал', niche:'уход', rel:87, hue:260, next:'follow-up через 2 дня', flag:true },
    ]},
    { title:'Ответили', count: 17, cards:[
      { name:'Real Talk',       platform:'Канал', niche:'lifestyle', rel:82, hue:200, next:'выслать ТЗ' },
      { name:'Skin Story',      platform:'Блог',niche:'beauty', rel:79, hue:340 },
    ]},
    { title:'В переговорах', count: 11, cards:[
      { name:'Beauty Notes',    platform:'Канал', niche:'уход', rel:92, hue:280, price:'бартер + 10K', next:'согласовать дату', flag:true },
    ]},
    { title:'Согласовано', count: 8, cards:[
      { name:'Market Finds',    platform:'Видео',   niche:'WB', rel:89, hue:230, price:'35K · 12.06' },
      { name:'Quick Picks',     platform:'Видео',   niche:'UGC', rel:85, hue:210, price:'CPA · промо' },
    ]},
    { title:'Размещение вышло', count: 5, cards:[
      { name:'Cozy Routines',   platform:'Блог',niche:'lifestyle', rel:81, hue:300, next:'снять отчёт' },
    ]},
    { title:'Результат зафиксирован', count: 3, cards:[
      { name:'Glow Letters',    platform:'Канал', niche:'уход', rel:87, hue:260, price:'CPM 320 ₽', next:'добавить в базу' },
    ]},
  ];
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100 flex items-center gap-3">
        <I.Pipeline size={16} className="accent-text"/>
        <div className="text-[14px] font-semibold">Воронка кампании · Косметика на WB</div>
        <span className="chip" style={{padding:'2px 8px', fontSize:11}}>126 авторов</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="chip"><I.Filter size={11}/> Фильтры</span>
          <span className="chip chip-accent"><I.Sparkle size={11}/> Подсказки 3</span>
        </div>
      </div>
      <div className="overflow-x-auto no-scrollbar p-4">
        <div className="flex gap-3 min-w-max">
          {cols.map((col, ci) => (
            <div key={ci} className="w-[210px] shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-[11.5px] font-semibold text-ink-700 uppercase tracking-wide">{col.title}</div>
                <span className="text-[10.5px] text-ink-400 font-mono">{col.count}</span>
              </div>
              <div className="space-y-2">
                {col.cards.map((card, i) => (
                  <div key={i} className="rounded-xl bg-white border border-ink-100 p-3 shadow-softer">
                    <div className="flex items-start gap-2">
                      <Avatar name={card.name} hue={card.hue} size={24} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-ink-900 truncate">{card.name}</div>
                        <div className="text-[10.5px] text-ink-500 flex items-center gap-1 truncate">
                          {platformIcon(card.platform)} {card.niche}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold accent-text">{card.rel}%</span>
                    </div>
                    {card.price && (
                      <div className="mt-2 text-[10.5px] text-ink-600 flex items-center gap-1">
                        <I.Coin size={10}/> {card.price}
                      </div>
                    )}
                    {card.next && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10.5px]"
                           style={{color: card.flag ? 'var(--accent)' : '#5b6175'}}>
                        {card.flag ? <I.Sparkle size={10}/> : <I.Arrow size={10}/>}
                        <span className="truncate">{card.next}</span>
                      </div>
                    )}
                  </div>
                ))}
                <button className="w-full text-[11px] text-ink-400 hover:text-ink-700 py-1.5 rounded-lg border border-dashed border-ink-200 hover:border-ink-300">
                  + добавить
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// — Brand knowledge base mockup (UTP2) —
const BrandKBMockup = () => (
  <div className="card p-5">
    <div className="flex items-center gap-2">
      <I.Brain size={16} className="accent-text"/>
      <div className="text-[14px] font-semibold">База знаний бренда · Soft Skin Co.</div>
      <span className="ml-auto chip chip-accent" style={{padding:'2px 8px', fontSize:11}}>обновлено сегодня</span>
    </div>

    <div className="mt-4 grid sm:grid-cols-2 gap-3">
      <KBBlock title="Продукт и аудитория" icon={<I.Compass size={13}/>}>
        <div className="space-y-1.5">
          <KBRow k="Сегмент" v="Уход для чувствительной кожи" />
          <KBRow k="Аудитория" v="Ж 25–40, Россия/СНГ" />
          <KBRow k="Каналы продаж" v="Wildberries · сайт бренда" />
        </div>
      </KBBlock>
      <KBBlock title="Визуальный стиль" icon={<I.Layers size={13}/>}>
        <div className="flex gap-1.5">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex-1 aspect-square rounded-lg bg-gradient-to-br from-rose-100 via-violet-100 to-indigo-100 border border-ink-100 relative overflow-hidden">
              <div className="absolute inset-0 opacity-50"
                   style={{background:`repeating-linear-gradient(45deg, transparent 0 6px, rgba(15,18,40,0.04) 6px 7px)`}}/>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-ink-500 mt-2">палитра · фото · упаковка · креативы</div>
      </KBBlock>
      <KBBlock title="Условия размещений" icon={<I.Coin size={13}/>}>
        <div className="flex flex-wrap gap-1.5">
          {['Фикс ≤ 30K','Бартер + 10K','CPA · промокод','Постоплата 30 дней'].map((t,i)=>(
            <span key={i} className="chip" style={{padding:'3px 8px', fontSize:11}}>{t}</span>
          ))}
        </div>
      </KBBlock>
      <KBBlock title="Ограничения" icon={<I.Lock size={13}/>}>
        <ul className="space-y-1.5 text-[12px] text-ink-700">
          <li className="flex gap-2"><I.Close size={12} className="text-rose-500 mt-0.5"/> Не обещать “вылечит акне”</li>
          <li className="flex gap-2"><I.Close size={12} className="text-rose-500 mt-0.5"/> Не сравнивать с конкурентами по имени</li>
          <li className="flex gap-2"><I.Check size={12} className="text-emerald-500 mt-0.5"/> Можно: “помогает успокоить кожу”</li>
        </ul>
      </KBBlock>
    </div>

    <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-50/50 p-3.5 flex items-start gap-3">
      <I.Sparkle size={14} className="accent-text mt-0.5"/>
      <div className="text-[12.5px] text-ink-700 leading-relaxed">
        На основе контекста бренда Collabrama подбирает авторов с подходящим tone of voice и
        формирует персональные сообщения, которые звучат как от бренда — не как массовая рассылка.
      </div>
    </div>
  </div>
);
const KBBlock = ({ title, icon, children }) => (
  <div className="rounded-2xl border border-ink-100 bg-white p-3.5">
    <div className="flex items-center gap-2 mb-2.5">
      <span className="w-6 h-6 rounded-md accent-soft-bg flex items-center justify-center accent-text">{icon}</span>
      <div className="text-[12.5px] font-semibold text-ink-900">{title}</div>
    </div>
    {children}
  </div>
);
const KBRow = ({ k, v }) => (
  <div className="flex items-center justify-between text-[12px]">
    <span className="text-ink-500">{k}</span>
    <span className="text-ink-800 font-medium">{v}</span>
  </div>
);

// — Semantic vs tag search comparison —
const SemanticCompare = () => (
  <div className="grid md:grid-cols-2 gap-4">
    <div className="card-soft p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center text-ink-600"><I.Tag size={15}/></span>
        <div>
          <div className="text-[14px] font-semibold text-ink-900">Обычный поиск</div>
          <div className="text-[11.5px] text-ink-500">по тегам и фильтрам</div>
        </div>
      </div>
      <ul className="space-y-2 text-[13px] text-ink-700">
        {['Категория','Платформа','Подписчики','Гео','Цена'].map((t,i)=>(
          <li key={i} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-ink-50 border border-ink-100">
            <span className="w-1.5 h-1.5 rounded-full bg-ink-300"/>
            {t}
          </li>
        ))}
      </ul>
    </div>
    <div className="card-soft p-5 relative overflow-hidden">
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full opacity-40"
           style={{background:'radial-gradient(closest-side, var(--accent-2), transparent 70%)'}}/>
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-lg accent-soft-bg flex items-center justify-center accent-text"><I.Sparkle size={15}/></span>
          <div>
            <div className="text-[14px] font-semibold text-ink-900">Семантический поиск Collabrama</div>
            <div className="text-[11.5px] text-ink-500">по смыслу и контексту</div>
          </div>
        </div>
        <ul className="space-y-2 text-[13px] text-ink-800">
          {[
            'Смысл и темы контента',
            'Глубина экспертизы в нише',
            'Стиль и tone of voice',
            'Визуальный ряд',
            'Профиль и интересы аудитории',
            'Формат прошлых интеграций',
            'Оценка релевантности продукту',
          ].map((t,i)=>(
            <li key={i} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-white border border-ink-100">
              <I.Check size={14} className="accent-text"/>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

// — Trend flow visual (vision) —
const TrendFlow = () => {
  const stages = [
    { p:'Видео', icon:<I.Sparkle size={14}/>, label:'зарождение тренда', value:'+18%', hue:240 },
    { p:'Видео', icon:<I.Sparkle size={14}/>, label:'рост вовлечённости', value:'+34%', hue:280 },
    { p:'Shorts-видео', icon:<I.Sparkle size={14}/>, label:'переход тренда в новый формат', value:'+62%', hue:320 },
    { p:'Канал', icon:<I.Chat size={14}/>, label:'рекомендация формата интеграции', value:'готово к ТЗ', hue:220, final:true },
  ];
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <I.Trend size={16} className="accent-text"/>
        <div className="text-[14px] font-semibold">Trend flow · косметика, июнь 2026</div>
        <span className="ml-auto chip chip-accent" style={{padding:'2px 8px', fontSize:11}}>vision</span>
      </div>

      <div className="mt-5 grid md:grid-cols-4 gap-3 relative">
        {/* connecting line (desktop) */}
        <div className="hidden md:block absolute left-[10%] right-[10%] top-[34px] h-0.5 -z-0"
             style={{background:'linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent-3))', opacity:0.35}}/>
        {stages.map((s,i)=>(
          <div key={i} className="relative">
            <div className={`rounded-2xl border p-3.5 bg-white ${s.final ? 'border-indigo-300 shadow-pop' : 'border-ink-100'}`}>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                      style={{background:`linear-gradient(135deg, hsl(${s.hue} 70% 60%), hsl(${(s.hue+40)%360} 70% 55%))`}}>
                  {s.icon}
                </span>
                <div className="text-[13px] font-semibold">{s.p}</div>
                <span className="ml-auto text-[11px] font-mono accent-text">{s.value}</span>
              </div>
              <div className="text-[11.5px] text-ink-500 mt-2 leading-snug">{s.label}</div>
              <div className="mt-3 h-9 rounded-lg bg-ink-50 border border-ink-100 flex items-end gap-0.5 px-1.5 py-1">
                {[3,5,4,7,6,9,8,12,11,14].map((v,j)=>(
                  <div key={j} className="flex-1 rounded-sm"
                       style={{height:`${v*5}%`, background: j>5 ? 'var(--accent)' : '#aeb2c0', opacity: j>5 ? 0.85 : 0.5}}/>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-50/50 p-4 text-[12.5px] text-ink-700 leading-relaxed">
        <span className="font-semibold text-ink-900">Пример: </span>
        тренд начинает переходить в соседние форматы → бренд может заранее подготовить
        интеграцию под этот формат и отправить автору ТЗ до того, как тренд станет перегретым.
      </div>
    </div>
  );
};

export { platformIcon, Avatar, PlatformAvatar, Spark, CreatorCard, Metric, HeroProductMockup, OutreachMockup, PipelineMockup, BrandKBMockup, SemanticCompare, TrendFlow };
