import React from "react";
import { I } from "./icons.jsx";
import { TrendFlow } from "./mockups.jsx";
import { Section, SectionHead } from "./sections.jsx";
import { SearchBox } from "./hero.jsx";
// Sections: audience → use cases → comparison → vision → objections → final CTA → FAQ → footer

// — Section 10: For whom (3 segments) —
const AudienceSection = () => {
  const cards = [
    {
      icon: <I.Briefcase size={16}/>,
      title: 'Бренды и e-commerce',
      lead: 'Быстрее запускайте кампании, находите авторов под конкретный продукт и контролируйте переговоры в одном месте.',
      hue: 250,
    },
    {
      icon: <I.Store size={16}/>,
      title: 'Продавцы на маркетплейсах',
      lead: 'Тестируйте авторов контента с микро- и мидл-аудиторией под товары на Wildberries, Ozon и других площадках без отдельного outreach-менеджера.',
      hue: 290,
    },
    {
      icon: <I.Users size={16}/>,
      title: 'Маркетинговые агентства',
      lead: 'Ведите больше клиентов и кампаний без пропорционального роста ручной работы, таблиц и контроля каждого диалога.',
      hue: 220,
    },
  ];
  return (
    <Section id="audience" className="py-16 sm:py-20">
      <SectionHead title="Для команд, которые регулярно работают с авторами контента" />
      <div className="mt-8 grid md:grid-cols-3 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="card-soft p-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0"
                    style={{background:`linear-gradient(135deg, hsl(${c.hue} 70% 60%), hsl(${(c.hue+40)%360} 70% 55%))`}}>
                {c.icon}
              </span>
              <div className="text-[14px] font-semibold text-ink-900">{c.title}</div>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-600 text-pretty">{c.lead}</p>
          </div>
        ))}
      </div>
    </Section>
  );
};

// — Section 11: Use cases —
const UseCasesSection = () => {
  const items = [
    { i:<I.Telegram size={14}/>, t:'Найти 50 Telegram-каналов для посева нового продукта' },
    { i:<I.Tiktok size={14}/>,   t:'Собрать TikTok-креаторов под UGC-контент' },
    { i:<I.Store size={14}/>,    t:'Найти авторов контента для товара на Wildberries' },
    { i:<I.Coin size={14}/>,     t:'Запустить переговоры по бартеру' },
    { i:<I.Sliders size={14}/>,  t:'Сравнить авторов по цене и вовлечённости' },
    { i:<I.Sparkle size={14}/>,  t:'Автоматизировать follow-up тем, кто не ответил' },
    { i:<I.Layers size={14}/>,   t:'Собрать базу авторов для повторных размещений' },
    { i:<I.Trend size={14}/>,    t:'Отследить результаты по каждому размещению' },
  ];
  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        eyebrow="Сценарии"
        title="Какие задачи можно запускать в Collabrama"
        accent
      />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((it, i) => (
          <div key={i} className="card-soft p-4 flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg accent-soft-bg flex items-center justify-center accent-text shrink-0">{it.i}</span>
            <div className="text-[13.5px] font-medium leading-snug text-ink-800 pt-1">{it.t}</div>
          </div>
        ))}
      </div>
    </Section>
  );
};

// — Section 12: Comparison table —
const CompareSection = () => {
  const rows = [
    ['Поиск по каналам, рекомендациям и старым таблицам', 'Семантический поиск под продукт и аудиторию'],
    ['Shortlist зависит от субъективного выбора менеджера', 'Отбор по релевантности, данным и условиям бренда'],
    ['Каждому автору контента нужно писать отдельно', 'Массовые персонализированные сообщения'],
    ['Статусы хранятся в голове или таблице', 'Единая CRM-воронка по всем авторам'],
    ['Follow-up легко забыть', 'Подсказки по следующим шагам'],
    ['Условия разбросаны по чатам', 'Цена, формат, дедлайн и условия в одном месте'],
    ['После кампании база не систематизируется', 'База авторов и история размещений остаются внутри компании'],
  ];
  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        eyebrow="Сравнение"
        title="Вместо ручного поиска, таблиц и потерянных переписок"
        accent
      />
      <div className="mt-10 card overflow-hidden">
        <div className="grid grid-cols-2 text-[11.5px] font-semibold uppercase tracking-wide">
          <div className="px-5 sm:px-7 py-3.5 bg-ink-50 text-ink-500 border-r border-ink-100">Ручной процесс</div>
          <div className="px-5 sm:px-7 py-3.5 accent-soft-bg accent-text flex items-center gap-2">
            <I.Sparkle size={12}/> Collabrama
          </div>
        </div>
        <div className="divide-soft">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2">
              <div className="px-5 sm:px-7 py-4 text-[13.5px] text-ink-500 border-r border-ink-100 flex items-start gap-2.5">
                <I.Close size={14} className="text-ink-300 mt-0.5 shrink-0"/>
                <span className="leading-relaxed">{r[0]}</span>
              </div>
              <div className="px-5 sm:px-7 py-4 text-[13.5px] text-ink-900 flex items-start gap-2.5">
                <I.Check size={14} className="accent-text mt-0.5 shrink-0"/>
                <span className="leading-relaxed font-medium">{r[1]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};

// — Section 13: Vision — trend analytics —
const VisionSection = () => (
  <Section id="vision" className="py-16 sm:py-20">
    <SectionHead
      eyebrow="Vision · advanced analytics"
      title="Следующий уровень — аналитика трендов и прогноз эффективности"
      subtitle="Collabrama развивается в сторону продвинутой аналитики: отслеживать, как тренды зарождаются в одной соцсети и перетекают в другие, чтобы заранее готовить авторам актуальные ТЗ под конкретную платформу."
      accent
    />
    <div className="mt-10">
      <TrendFlow/>
    </div>
  </Section>
);

// — Section 14: Objections —
const ObjectionsSection = () => {
  const items = [
    { q:'«Это просто база авторов контента?»',
      a:'Нет. База — только часть процесса. Collabrama помогает искать, отбирать, писать, вести статусы, фиксировать условия и анализировать размещения.' },
    { q:'«Сервис полностью заменяет менеджера?»',
      a:'Нет. Он снимает рутину и помогает вести процесс, но финальные решения, условия и контроль остаются за командой.' },
    { q:'«Можно работать без большого бюджета?»',
      a:'Да. Можно задавать бартер, CPA, CPM, постоплату или смешанные условия. Но важно понимать: чем жёстче условия, тем ниже конверсия в согласие.' },
    { q:'«Как понять, что автор контента подойдёт?»',
      a:'Collabrama помогает оценивать релевантность по смыслу продукта, аудитории, контенту, платформе, условиям и данным, но финальную эффективность всё равно показывает тест.' },
  ];
  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        eyebrow="Возражения"
        title="Что важно понимать до запуска"
        accent
      />
      <div className="mt-10 grid md:grid-cols-2 gap-4">
        {items.map((it, i) => (
          <div key={i} className="card-soft p-6">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-ink-50 border border-ink-100 flex items-center justify-center text-ink-700 shrink-0">
                <I.Question size={16}/>
              </span>
              <div className="text-[15.5px] font-semibold text-ink-900 leading-snug pt-1">{it.q}</div>
            </div>
            <div className="mt-4 pl-12 text-[14px] text-ink-600 leading-relaxed text-pretty">{it.a}</div>
          </div>
        ))}
      </div>
    </Section>
  );
};

// — Section 15: Final CTA —
const FinalCTASection = ({ onSearch }) => {
  const placeholder = "Например: Бренд спортивного питания — протеин и предтреники, продаём на Ozon и своём сайте. Нужны авторы, которые реально разбираются в тренировках и питании (а не просто фитнес-картинки): говорят про составы, БЖУ, режим, восстановление. Аудитория — мужчины 20–35, RU. Telegram и TikTok. Формат — честный обзор с личным опытом и демонстрацией. Tone of voice — экспертный, без хайпа и обещаний «чудо-результата». Бюджет — бартер или фикс до 30 000 ₽, интересен CPA с промокодом.";
  return (
    <Section className="py-16 sm:py-20">
      <div className="relative card overflow-hidden p-6 sm:p-10 lg:p-14">
        <div className="absolute inset-0 pointer-events-none opacity-90"
             style={{background:'radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, var(--accent) 12%, transparent), transparent 70%)'}}/>
        <div className="absolute -right-32 -bottom-32 w-[420px] h-[420px] rounded-full opacity-30 pointer-events-none"
             style={{background:'radial-gradient(closest-side, var(--accent-2), transparent 70%)'}}/>
        <div className="relative max-w-[860px] mx-auto text-center">
          <h2 className="text-[32px] sm:text-[44px] leading-[1.05] font-bold tracking-[-0.02em] text-balance">
            Попробуйте <span className="grad-text">умный подбор</span> под ваш продукт
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-600 max-w-[640px] mx-auto text-pretty">
            Опишите продукт подробно — чем детальнее, тем точнее подбор. Collabrama покажет, как
            может выглядеть подборка авторов, чей контент по смыслу совпадает с вашим продуктом.
          </p>
          <div className="mt-7 max-w-[680px] mx-auto text-left">
            <SearchBox
              placeholder={placeholder}
              onSubmit={onSearch}
              label="Опишите детали продукта"
            />
          </div>
        </div>
      </div>
    </Section>
  );
};

// — Section 16: FAQ —
const FAQSection = () => {
  const items = [
    { q:'Это база авторов контента?',
      a:'Нет. Collabrama — это система для поиска, отбора, коммуникации и управления размещениями у авторов контента.' },
    { q:'Чем семантический поиск отличается от обычных фильтров?',
      a:'Обычные фильтры ищут по категории, платформе и количеству подписчиков. Collabrama учитывает смысл продукта, аудиторию бренда, визуальный стиль, tone of voice, условия сотрудничества и потенциальную релевантность автора.' },
    { q:'Можно ли запускать массовые сообщения?',
      a:'Да. Смысл системы — помогать вести десятки переговоров параллельно, но с персонализацией и контролем статусов.' },
    { q:'Сервис сам договаривается с авторами контента?',
      a:'Collabrama помогает готовить сообщения, follow-up, фиксировать ответы, условия и следующие шаги. Финальные решения и согласование условий остаются за командой.' },
    { q:'Можно ли работать по бартеру или CPA?',
      a:'Да. В условиях кампании можно задать разные модели: фиксированная оплата, бартер, CPM, CPA, постоплата или индивидуальные условия.' },
    { q:'Подходит ли продавцам на маркетплейсах?',
      a:'Да. Особенно если нужно регулярно тестировать размещения у авторов контента с микро- и мидл-аудиторией под конкретные товары.' },
    { q:'Подходит ли агентствам?',
      a:'Да. Агентства могут вести больше кампаний и клиентов в единой системе без пропорционального роста ручной работы.' },
    { q:'Аналитика трендов уже доступна?',
      a:'Это направление развития продукта. Первый фокус Collabrama — поиск релевантных авторов, массовый outreach, CRM-воронка и аналитика размещений.' },
  ];
  const [open, setOpen] = React.useState(0);
  return (
    <Section id="faq" className="py-16 sm:py-20">
      <div className="grid lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-4">
          <SectionHead
            eyebrow="FAQ"
            title="Частые вопросы"
            subtitle="Если что-то непонятно — напишите нам, и мы добавим ответ сюда."
            accent
          />
        </div>
        <div className="lg:col-span-8">
          <div className="card divide-soft">
            {items.map((it, i) => {
              const isOpen = open === i;
              return (
                <button
                  key={i}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="w-full text-left px-5 sm:px-6 py-5 flex items-start gap-4 hover:bg-ink-50/40 transition-colors"
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors
                                    ${isOpen ? 'accent-bg text-white' : 'bg-ink-100 text-ink-600'}`}>
                    {isOpen ? <I.Minus size={13}/> : <I.Plus size={13}/>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-ink-900 text-pretty">{it.q}</div>
                    {isOpen && (
                      <div className="mt-2.5 text-[14px] leading-relaxed text-ink-600 animate-rise text-pretty">{it.a}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Section>
  );
};

// — Section 17: Footer —
const LEGAL_LINKS = [
  { href: "/legal/offer.html", label: "Публичная оферта" },
  { href: "/legal/privacy.html", label: "Политика обработки ПДн" },
  { href: "/legal/aup.html", label: "Политика использования сервиса" },
  { href: "/legal/cookie.html", label: "Уведомление о cookie" },
];

const Footer = ({ onSearch }) => (
  <footer className="relative mt-10 border-t border-ink-100 bg-white/60">
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] leading-relaxed text-ink-600 max-w-[560px] text-pretty">
        AI-система для поиска авторов контента, массовых переговоров и управления influencer-кампаниями.
      </p>
      <div className="text-[12.5px] text-ink-500">© 2026 Collabrama · 12+</div>
    </div>
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-6 flex flex-wrap gap-x-5 gap-y-2">
      {LEGAL_LINKS.map((l) => (
        <a key={l.href} href={l.href} className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800 transition-colors">
          {l.label}
        </a>
      ))}
    </div>
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-8 text-[11.5px] leading-relaxed text-ink-400">
      ИП Глушакова Марина Сергеевна · ИНН 672608517020 · ОГРНИП 326774600410105 ·{" "}
      <a href="mailto:info@collabrama.ru" className="underline underline-offset-2 hover:text-ink-600">info@collabrama.ru</a>
    </div>
  </footer>
);

const COOKIE_KEY = "cf_cookie_accepted";

const CookieBanner = () => {
  const [visible, setVisible] = React.useState(() => {
    try {
      return !localStorage.getItem(COOKIE_KEY);
    } catch {
      return true;
    }
  });
  if (!visible) return null;
  const accept = () => {
    try {
      localStorage.setItem(COOKIE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[640px] w-[calc(100%-32px)] rounded-2xl border border-ink-100 bg-white shadow-xl px-5 py-4 flex flex-wrap items-center gap-3">
      <p className="text-[12.5px] leading-relaxed text-ink-600 flex-1 min-w-[240px]">
        Мы используем cookie для работы сайта и аналитики. Продолжая пользоваться сайтом, вы соглашаетесь с{" "}
        <a href="/legal/cookie.html" className="underline underline-offset-2 text-ink-800">уведомлением об использовании cookie</a>.
      </p>
      <button
        onClick={accept}
        className="px-4 h-9 rounded-lg bg-ink-900 text-white text-[13px] font-semibold hover:bg-ink-700 transition-colors"
      >
        Принять
      </button>
    </div>
  );
};

export { AudienceSection, UseCasesSection, CompareSection, VisionSection, ObjectionsSection, FinalCTASection, FAQSection, Footer, CookieBanner };
