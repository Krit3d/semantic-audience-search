import React from "react";
import { I } from "./icons.jsx";
import { PageShell } from "./page-shell.jsx";
// Публичные страницы «О нас» и «Контакты».

const VALUES = [
  {
    title: "Семантический поиск авторов",
    text: "Запрос свободным текстом превращается в релевантную выдачу: система понимает содержание постов и транскрипций видео, а не только подписи и хэштеги.",
  },
  {
    title: "CRM для сделок",
    text: "Канбан, карточки авторов, история коммуникаций, договоры и реестр маркировки рекламы — весь цикл от первого касания до публикации в одном месте.",
  },
  {
    title: "Прозрачность и безопасность",
    text: "Открытые тарифы без скрытых платежей, понятные условия подписки и возврата, оплата через защищённый платёжный шлюз CloudPayments.",
  },
];

export function AboutPage() {
  return (
    <PageShell>
      <div className="max-w-[860px] mx-auto px-5 sm:px-8 pt-14 pb-16">
        <div className="mono-mini accent-text">О нас</div>
        <h1 className="mt-2 font-extrabold tracking-[-0.02em] text-[36px] sm:text-[44px] leading-[1.08]">
          Collabrama — платформа инфлюенс-маркетинга
        </h1>
        <div className="mt-5 text-[15.5px] leading-relaxed text-ink-600 flex flex-col gap-3">
          <p>
            Collabrama помогает брендам и агентствам наводить порядок в работе с блогерами:
            находить авторов по смыслу контента, а не по хэштегам, и вести сделки от первого
            касания до публикации — без хаоса в таблицах и переписках.
          </p>
          <p>
            Мы верим, что инфлюенс-маркетинг должен быть предсказуемым: понятные тарифы,
            прозрачные условия, измеримый результат.
          </p>
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {VALUES.map((v) => (
            <div key={v.title} className="card p-5 flex flex-col gap-2">
              <span className="w-9 h-9 rounded-xl accent-soft-bg accent-text flex items-center justify-center"><I.Sparkle size={16} /></span>
              <div className="text-[14.5px] font-bold text-ink-900">{v.title}</div>
              <div className="text-[12.5px] leading-relaxed text-ink-600">{v.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 card p-6">
          <div className="text-[15px] font-bold text-ink-900">Реквизиты исполнителя</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
            ИП Глушакова Марина Сергеевна · ИНН 672608517020 · ОГРНИП 326774600410105 ·{" "}
            <a href="mailto:info@collabrama.ru" className="underline underline-offset-2 text-ink-800">info@collabrama.ru</a>
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] font-semibold">
            <a href="/legal/offer.html" className="underline underline-offset-2 text-ink-700 hover:text-ink-900">Публичная оферта</a>
            <a href="/legal/privacy.html" className="underline underline-offset-2 text-ink-700 hover:text-ink-900">Политика обработки ПДн</a>
            <a href="/legal/consent-pdn.html" className="underline underline-offset-2 text-ink-700 hover:text-ink-900">Согласие на обработку ПДн</a>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

const CONTACT_CARDS = [
  {
    title: "Почта поддержки",
    value: "support@collabrama.ru",
    href: "mailto:support@collabrama.ru",
    note: "Вопросы по подписке, оплате, возвратам и работе сервиса. Отвечаем в рабочие дни.",
  },
  {
    title: "Общие вопросы",
    value: "info@collabrama.ru",
    href: "mailto:info@collabrama.ru",
    note: "Партнёрство, пресса, юридические вопросы.",
  },
  {
    title: "Отмена подписки",
    value: "В один клик из CRM",
    href: "/pricing",
    note: "Раздел «Тарифы» в личном кабинете — кнопка отмены с подтверждением паролем. Без писем и ожиданий.",
  },
  {
    title: "Сайт платформы",
    value: "collabrama.ru",
    href: "/landing",
    note: "Лендинг, поиск авторов и материалы о платформе.",
  },
];

export function ContactsPage() {
  return (
    <PageShell>
      <div className="max-w-[860px] mx-auto px-5 sm:px-8 pt-14 pb-16">
        <div className="mono-mini accent-text">Контакты</div>
        <h1 className="mt-2 font-extrabold tracking-[-0.02em] text-[36px] sm:text-[44px] leading-[1.08]">Мы на связи</h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600 max-w-[640px]">
          По любым вопросам: подписка и оплата, работа сервиса, партнёрство.
        </p>

        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {CONTACT_CARDS.map((c) => (
            <a key={c.title} href={c.href} className="card p-5 flex flex-col gap-1.5 hover:border-ink-300 transition-colors">
              <div className="text-[14.5px] font-bold text-ink-900">{c.title}</div>
              <div className="text-[13.5px] font-semibold accent-text">{c.value}</div>
              <div className="text-[12.5px] leading-relaxed text-ink-500">{c.note}</div>
            </a>
          ))}
        </div>

        <div className="mt-10 card p-6">
          <div className="text-[15px] font-bold text-ink-900">Юридическая информация</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
            Исполнитель — ИП Глушакова Марина Сергеевна · ИНН 672608517020 · ОГРНИП 326774600410105.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] font-semibold">
            <a href="/legal/offer.html" className="underline underline-offset-2 text-ink-700 hover:text-ink-900">Публичная оферта</a>
            <a href="/legal/privacy.html" className="underline underline-offset-2 text-ink-700 hover:text-ink-900">Политика обработки ПДн</a>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
