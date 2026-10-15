import React from "react";
import { I } from "./icons.jsx";
import { SemanticCompare, OutreachMockup, PipelineMockup } from "./mockups.jsx";
// Sections: pain → insight → solution → UTPs 1-4

// — Reusable section heading —
const SectionHead = ({ eyebrow, title, subtitle, align = 'left', accent = false }) =>
<div className={`max-w-[760px] ${align === 'center' ? 'mx-auto text-center' : ''}`}>
    <h2 className="text-[30px] sm:text-[40px] leading-[1.08] font-bold tracking-[-0.02em] text-balance text-ink-900">
      {title}
    </h2>
    {subtitle &&
  <p className="mt-4 text-[16px] sm:text-[17px] text-ink-600 leading-relaxed text-pretty" style={{ fontWeight: "400" }}>{subtitle}</p>
  }
  </div>;


const Section = ({ id, className = '', children, bleed = false }) =>
<section id={id} className={`relative ${className}`}>
    <div className={bleed ? '' : 'max-w-[1200px] mx-auto px-5 sm:px-8'}>
      {children}
    </div>
  </section>;


// — Section 3: Pain points —
const PainSection = () => {
  const items = [
  { i: <I.Clock size={16} />, title: 'Поиск занимает часы',
    text: 'Авторов ищут через Telegram-каналы, рекомендации, старые таблицы, поиск по соцсетям и ручной скроллинг.' },
  { i: <I.Eye size={16} />, title: 'Отбор субъективен',
    text: 'Подбор чаще идёт по обложке (категория/подписчики), чем по смыслу контента.' },
  { i: <I.Chat size={16} />, title: 'Переписки расползаются',
    text: 'Telegram, Instagram, почта, заметки и таблицы быстро превращают кампанию в хаос.' },
  { i: <I.Sparkle size={16} />, title: 'Follow-up забывается',
    text: 'Нужно помнить, кому написать повторно, кто запросил ТЗ, кто назвал цену, кто пропал и кого пора дожать.' },
  { i: <I.Coin size={16} />, title: 'Условия сложно сравнить',
    text: 'Цена, формат, дедлайн, бартер, CPM, CPA или постоплата лежат в разных чатах.' },
  { i: <I.Spreadsheet size={16} />, title: 'База не накапливается',
    text: 'После кампании знания об авторах контента часто остаются у менеджера, а не внутри компании.' }];

  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        eyebrow="Боль ручного процесса"
        title="Когда авторов контента больше десяти, ручной процесс начинает разваливаться"
        subtitle="Менеджеры ищут авторов вручную, собирают таблицы, пишут каждому отдельно и держат статусы в голове. В итоге бренд часто работает не с самыми подходящими авторами, а с теми, кого удалось найти и кто ответил." />
      
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it, i) =>
        <div key={i} className="card-soft p-6">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-ink-50 border border-ink-100 flex items-center justify-center text-ink-700">{it.i}</span>
              <div className="text-[15px] font-semibold text-ink-900">{it.title}</div>
            </div>
            <p className="mt-3.5 text-[14px] leading-relaxed text-ink-600 text-pretty">{it.text}</p>
          </div>
        )}
      </div>
    </Section>);

};

// — Section 4: Insight —
const InsightSection = () =>
<Section className="py-20 sm:py-24">
    <div className="card relative overflow-hidden p-8 sm:p-14">
      <div className="absolute -right-32 -top-32 w-[420px] h-[420px] rounded-full opacity-40 pointer-events-none"
    style={{ background: 'radial-gradient(closest-side, var(--accent-2), transparent 70%)' }} />
      <div className="absolute -left-24 -bottom-32 w-[360px] h-[360px] rounded-full opacity-30 pointer-events-none"
    style={{ background: 'radial-gradient(closest-side, var(--accent-3), transparent 70%)' }} />
      <div className="relative grid lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7">
          <h2 className="text-[28px] sm:text-[38px] leading-[1.1] font-bold tracking-[-0.02em] text-balance">
            Проблема не в том, что авторов контента мало.
            <span className="grad-text"> Проблема в том, что процесс слишком ручной</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-600 text-pretty max-w-[640px]">
            Influencer marketing растёт, но масштабируется медленно, потому что поиск, отбор,
            коммуникация, условия и аналитика до сих пор держатся на менеджерах, таблицах и переписках.
          </p>
        </div>
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-ink-100 bg-white/70 backdrop-blur p-5">
            <div className="mono-mini">Тезис</div>
            <p className="mt-2.5 text-[16px] leading-relaxed font-medium text-ink-900">
              Collabrama превращает закупку рекламы у авторов контента в управляемую воронку:
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {['поиск', 'отбор', 'сообщения', 'ответы', 'условия', 'размещения', 'результат'].map((s, i, arr) =>
            <React.Fragment key={s}>
                  <span className="chip chip-accent" style={{ padding: '4px 10px' }}>{s}</span>
                  {i < arr.length - 1 && <I.Arrow size={12} className="text-ink-300" />}
                </React.Fragment>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Section>;


// — Section 5: Solution — flow, focus on meaning —
const SolutionSection = () => {
  const steps = [
  { t: 'Опишите задачу', icon: <I.Sliders size={16} /> },
  { t: 'Получите релевантных авторов', icon: <I.Sparkle size={16} /> },
  { t: 'Соберите shortlist', icon: <I.Users size={16} /> },
  { t: 'Запустите десятки переговоров параллельно', icon: <I.Send size={16} /> },
  { t: 'Контролируйте размещения', icon: <I.Pipeline size={16} /> }];

  return (
    <Section id="how" className="py-16 sm:py-20">
      <SectionHead
        title="С Collabrama все договорённости — в одном процессе"
        subtitle="Вместо ручного поиска, субъективного отбора и потерянных переписок — семантический поиск под продукт, массовый персонализированный outreach и единая CRM-воронка, где остаётся вся история размещений." />

      <div className="mt-10 flex flex-col lg:flex-row lg:items-center gap-2">
        {steps.map((s, i) =>
        <React.Fragment key={i}>
            <div className="card-soft px-5 py-4 flex-1 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl accent-soft-bg flex items-center justify-center accent-text shrink-0">
                {s.icon}
              </span>
              <div className="text-[14.5px] font-semibold text-ink-900 leading-snug">{s.t}</div>
            </div>
            {i < steps.length - 1 &&
            <div className="flex items-center justify-center text-ink-300 shrink-0 rotate-90 lg:rotate-0">
                <I.Arrow size={18} />
              </div>
            }
          </React.Fragment>
        )}
      </div>
    </Section>);

};

// — Section 6: UTP — semantic search —
const SemanticSection = () =>
<Section id="features" className="py-16 sm:py-20">
    <div className="max-w-[900px] mb-12">
      <blockquote className="relative pl-6 border-l-2 border-indigo-300">
        <p className="text-[24px] sm:text-[32px] leading-[1.2] font-semibold tracking-[-0.01em] text-ink-900 text-balance">
          Точнее попадание в аудиторию <span className="grad-text">— выше шанс релевантного отклика.</span>
        </p>
      </blockquote>
    </div>
    <div className="grid lg:grid-cols-12 gap-10 items-start">
      <div className="lg:col-span-5 lg:sticky lg:top-24">
        <SectionHead
        title="Релевантность решает не категория, а совпадение смысла контента с продуктом"
        subtitle="Обычная база показывает авторов по категориям: beauty, lifestyle, fitness. Collabrama анализирует, о чём и как автор реально говорит, и сопоставляет это с вашим продуктом, аудиторией, визуальным стилем и tone of voice — чтобы подбирать не «авторов из категории», а тех, кому продукт действительно подходит." />
      </div>
      <div className="lg:col-span-7">
        <SemanticCompare />
      </div>
    </div>
  </Section>;


// — Section 7: relevance by content meaning —
const BrandKBSection = () => {
  const cards = [
  { i: <I.Compass size={15} />, t: 'Смысл контента автора', d: 'О чём и как он реально говорит — темы, подача, tone of voice, а не только категория.' },
  { i: <I.Layers size={15} />, t: 'Визуальный стиль', d: 'Как выглядит контент: эстетика, формат, подача — совпадает ли с брендом.' },
  { i: <I.Users size={15} />, t: 'Аудитория и её интересы', d: 'Кому и о чём говорит автор, насколько это пересекается с вашим покупателем.' },
  { i: <I.Sparkle size={15} />, t: 'Совместимость с продуктом', d: 'Насколько органично продукт впишется в контент автора без натяжки.' }];

  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        title="Релевантность решает не категория, а совпадение смысла контента автора с продуктом"
        subtitle="Collabrama анализирует, о чём и как автор реально говорит, и сопоставляет это с вашим продуктом, аудиторией, визуальным стилем и tone of voice — чтобы подбирать не «авторов из категории», а тех, кому продукт действительно подходит." />

      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) =>
        <div key={i} className="card-soft p-5">
            <span className="w-9 h-9 rounded-xl accent-soft-bg flex items-center justify-center accent-text">{c.i}</span>
            <div className="mt-3.5 text-[14.5px] font-semibold text-ink-900">{c.t}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-600 text-pretty">{c.d}</p>
          </div>
        )}
      </div>

      <div className="mt-6 max-w-[760px] rounded-2xl border border-ink-100 bg-white p-4 flex items-center gap-3 text-[13.5px] text-ink-700 leading-relaxed">
        <span className="w-8 h-8 rounded-lg accent-soft-bg flex items-center justify-center accent-text shrink-0"><I.Trend size={15} /></span>
        <div>
          <span className="font-semibold text-ink-900">Точнее попадание в аудиторию </span>
          <I.Arrow size={13} className="inline accent-text mx-1" />
          выше шанс релевантного отклика.
        </div>
      </div>
    </Section>);

};

// — Section 8: mass outreach —
const OutreachSection = () => {
  return (
    <Section className="py-16 sm:py-20">
      <div className="grid lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 order-2 lg:order-1">
          <div className="max-w-[440px] mx-auto lg:mx-0">
            <OutreachMockup />
          </div>
        </div>
        <div className="lg:col-span-6 order-1 lg:order-2">
          <SectionHead
            title="Не один диалог за раз, а десятки переговоров параллельно"
            subtitle="Вы задаёте правила, условия и стиль общения. Collabrama помогает запускать персонализированный outreach по выбранным авторам и фиксировать каждый ответ, цену, статус и следующий шаг." />
        </div>
      </div>
    </Section>);

};

// — Section 9: UTP — CRM pipeline —
const PipelineSection = () =>
<Section className="py-16 sm:py-20">
    <SectionHead
    eyebrow="CRM-воронка размещений"
    title="Вся кампания — как понятная CRM-воронка"
    subtitle="Каждый автор контента проходит этапы: найден, отобран, отправлено сообщение, ответил, запросил ТЗ, назвал цену, согласовано, размещение вышло, результат зафиксирован."
    accent />
  
    <div className="mt-10">
      <PipelineMockup />
    </div>
  </Section>;

export { SectionHead, Section, PainSection, InsightSection, SolutionSection, SemanticSection, BrandKBSection, OutreachSection, PipelineSection };
