import React from "react";
import { I } from "./icons.jsx";
import { Logo } from "./hero.jsx";
import { getCrmLoginUrl, isAuthenticated } from "./auth.js";
import { openCookieSettings } from "./cookie-consent.js";
// Общий каркас публичных страниц лендинга (/pricing, /about, /contacts).

export function PageShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center gap-6">
          <a href="/landing" className="flex items-center gap-2">
            <Logo />
            <span className="font-bold tracking-tight text-[17px]">Collabrama</span>
          </a>
          <nav className="hidden md:flex items-center gap-1 ml-2">
            <a href="/pricing" className="inline-flex items-center text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 rounded-full px-3 py-1.5 transition-colors">Тарифы</a>
            <a href="/about" className="inline-flex items-center text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 rounded-full px-3 py-1.5 transition-colors">О нас</a>
            <a href="/contacts" className="inline-flex items-center text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 rounded-full px-3 py-1.5 transition-colors">Контакты</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {isAuthenticated() ? (
              <a href="/" className="btn-primary inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-4 py-1.5">
                Открыть приложение <I.Arrow size={13} />
              </a>
            ) : (
              <>
                <a href={getCrmLoginUrl()} className="inline-flex items-center text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 rounded-full px-3 py-1.5 transition-colors">Войти</a>
                <a href={getCrmLoginUrl()} className="btn-primary inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-4 py-1.5">
                  Попробовать <I.Arrow size={13} />
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-ink-100 bg-white/60">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-6 flex flex-wrap gap-x-5 gap-y-2">
          <a href="/pricing" className="text-[12.5px] font-semibold text-ink-700 underline decoration-ink-200 underline-offset-2 hover:text-ink-900">Тарифы и подписка</a>
          <a href="/about" className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">О нас</a>
          <a href="/contacts" className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">Контакты</a>
          <a href="/legal/offer.html" className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">Публичная оферта</a>
          <a href="/legal/privacy.html" className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">Политика обработки ПДн</a>
          <a href="/legal/cookie.html" className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">Уведомление о cookie</a>
          <button type="button" onClick={openCookieSettings} className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">Настройки cookie</button>
        </div>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-8 text-[11.5px] leading-relaxed text-ink-400">
          ИП Глушакова Марина Сергеевна · ИНН 672608517020 · ОГРНИП 326774600410105 ·{" "}
          <a href="mailto:info@collabrama.ru" className="underline underline-offset-2 hover:text-ink-600">info@collabrama.ru</a>
        </div>
      </footer>
    </div>
  );
}
