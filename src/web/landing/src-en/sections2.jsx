import React from "react";
import { I } from "../src/icons.jsx";
import { TrendFlow } from "../src/mockups.jsx";
import { Section, SectionHead } from "./sections.jsx";
import { SearchBox } from "./hero.jsx";
import {
  CONSENT_SETTINGS_EVENT,
  acceptAllConsent,
  getConsent,
  openCookieSettings,
  rejectAllConsent,
  saveConsent,
} from "../src/cookie-consent.js";
// Sections: audience → use cases → comparison → vision → objections → final CTA → FAQ → footer

// — Section 10: For whom (3 segments) —
const AudienceSection = () => {
  const cards = [
    {
      icon: <I.Briefcase size={16}/>,
      title: 'Brands & e-commerce',
      lead: 'Launch campaigns faster, find creators for a specific product and keep every negotiation in one place.',
      hue: 250,
    },
    {
      icon: <I.Store size={16}/>,
      title: 'Marketplace sellers',
      lead: 'Test micro- and mid-tier creators for products on Amazon, Etsy and other marketplaces — without a dedicated outreach manager.',
      hue: 290,
    },
    {
      icon: <I.Users size={16}/>,
      title: 'Marketing agencies',
      lead: 'Run more clients and campaigns without a proportional rise in manual work, spreadsheets and per-thread oversight.',
      hue: 220,
    },
  ];
  return (
    <Section id="audience" className="py-16 sm:py-20">
      <SectionHead title="For teams that work with creators on a regular basis" />
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
    { i:<I.Chat size={14}/>, t:'Find 50 niche channels to seed a new product' },
    { i:<I.Sparkle size={14}/>,   t:'Assemble creators for UGC content' },
    { i:<I.Store size={14}/>,    t:'Find creators for a product on Amazon' },
    { i:<I.Coin size={14}/>,     t:'Launch barter negotiations' },
    { i:<I.Sliders size={14}/>,  t:'Compare creators by price and engagement' },
    { i:<I.Sparkle size={14}/>,  t:'Automate follow-ups with everyone who didn\u2019t reply' },
    { i:<I.Layers size={14}/>,   t:'Build a creator base for repeat placements' },
    { i:<I.Trend size={14}/>,    t:'Track results for every placement' },
  ];
  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        title="What you can run in Collabrama"
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
    ['Searching channels, referrals and old spreadsheets', 'Semantic search matched to product and audience'],
    ['The shortlist depends on the manager\u2019s subjective pick', 'Selection by relevance, data and brand terms'],
    ['Every creator has to be messaged separately', 'Mass personalized messages'],
    ['Statuses live in your head or a spreadsheet', 'A single CRM pipeline across all creators'],
    ['Follow-ups are easy to forget', 'Prompts for the next steps'],
    ['Terms scattered across chats', 'Price, format, deadline and terms in one place'],
    ['After a campaign the base isn\u2019t organized', 'Creator base and placement history stay inside the company'],
  ];
  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        title="Instead of manual search, spreadsheets and lost chats"
      />
      <div className="mt-10 card overflow-hidden">
        <div className="grid grid-cols-2 text-[11.5px] font-semibold uppercase tracking-wide">
          <div className="px-5 sm:px-7 py-3.5 bg-ink-50 text-ink-500 border-r border-ink-100">Manual process</div>
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
      title="The next level — trend analytics and performance forecasting"
      subtitle="Collabrama is moving toward advanced analytics: tracking how trends emerge on one platform and flow into others, so you can prepare timely briefs for a specific platform ahead of time."
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
    { q:'“Isn\u2019t this just a creator database?”',
      a:'No. The database is only part of the process. Collabrama helps you search, shortlist, message, track statuses, record terms and analyze placements.' },
    { q:'“Does it fully replace a manager?”',
      a:'No. It removes the routine and helps run the process, but final decisions, terms and control stay with your team.' },
    { q:'“Can we work without a big budget?”',
      a:'Yes. You can set barter, CPA, CPM, post-payment or mixed terms. Just keep in mind: the tougher the terms, the lower the acceptance rate.' },
    { q:'“How do we know a creator will fit?”',
      a:'Collabrama helps assess relevance by product meaning, audience, content, platform, terms and data — but final performance is always proven by a test.' },
  ];
  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        title="What to keep in mind before you start"
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
  const placeholder = "For example: A sports-nutrition brand — protein and pre-workouts, sold on Amazon and our own site. We need creators who genuinely understand training and nutrition (not just fitness visuals): they talk about ingredients, macros, routines and recovery. Audience — men 20–35, US & UK. Format — an honest review with personal experience and a demo. Tone of voice — expert, no hype and no “miracle results” promises. Budget — barter or a flat fee up to $500, open to CPA with a promo code.";
  return (
    <Section className="py-16 sm:py-20">
      <div className="relative card overflow-hidden p-6 sm:p-10 lg:p-14">
        <div className="absolute inset-0 pointer-events-none opacity-90"
             style={{background:'radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, var(--accent) 12%, transparent), transparent 70%)'}}/>
        <div className="absolute -right-32 -bottom-32 w-[420px] h-[420px] rounded-full opacity-30 pointer-events-none"
             style={{background:'radial-gradient(closest-side, var(--accent-2), transparent 70%)'}}/>
        <div className="relative max-w-[860px] mx-auto text-center">
          <h2 className="text-[32px] sm:text-[44px] leading-[1.05] font-bold tracking-[-0.02em] text-balance">
            Try <span className="grad-text">smart matching</span> for your product
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-600 max-w-[640px] mx-auto text-pretty">
            Describe your product in detail — the more specific, the more precise the match. Collabrama
            will show what a lineup of creators whose content matches your product could look like.
          </p>
          <div className="mt-7 max-w-[680px] mx-auto text-left">
            <SearchBox
              placeholder={placeholder}
              onSubmit={onSearch}
              label="Describe your product details"
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
    { q:'Is this a creator database?',
      a:'No. Collabrama is a system for searching, shortlisting, communicating and managing creator placements.' },
    { q:'How does semantic search differ from regular filters?',
      a:'Regular filters search by category, platform and follower count. Collabrama accounts for the product meaning, the brand\u2019s audience, visual style, tone of voice, collaboration terms and a creator\u2019s potential relevance.' },
    { q:'Can I send mass messages?',
      a:'Yes. The whole point is to help you run dozens of negotiations in parallel — but with personalization and status control.' },
    { q:'Does the service negotiate with creators on its own?',
      a:'Collabrama helps prepare messages and follow-ups and record replies, terms and next steps. Final decisions and agreeing terms stay with your team.' },
    { q:'Can I work on barter or CPA?',
      a:'Yes. In the campaign terms you can set different models: flat fee, barter, CPM, CPA, post-payment or custom terms.' },
    { q:'Is it a fit for marketplace sellers?',
      a:'Yes. Especially if you need to regularly test placements with micro- and mid-tier creators for specific products.' },
    { q:'Is it a fit for agencies?',
      a:'Yes. Agencies can run more campaigns and clients in a single system without a proportional rise in manual work.' },
    { q:'Is trend analytics available yet?',
      a:'That\u2019s a direction of product development. Collabrama\u2019s first focus is finding relevant creators, mass outreach, the CRM pipeline and placement analytics.' },
  ];
  const [open, setOpen] = React.useState(0);
  return (
    <Section id="faq" className="py-16 sm:py-20">
      <div className="grid lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-4">
          <SectionHead
            title="Frequently asked questions"
            subtitle="If anything is unclear, drop us a line and we\u2019ll add the answer here."
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
  { href: "/legal/offer.html", label: "Public offer" },
  { href: "/legal/privacy.html", label: "Privacy policy" },
  { href: "/legal/aup.html", label: "Acceptable use policy" },
  { href: "/legal/cookie.html", label: "Cookie notice" },
];

const Footer = ({ onSearch }) => (
  <footer className="relative mt-10 border-t border-ink-100 bg-white/60">
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] leading-relaxed text-ink-600 max-w-[560px] text-pretty">
        An AI system for finding creators, running mass negotiations and managing influencer campaigns.
      </p>
      <div className="text-[12.5px] text-ink-500">© 2026 Collabrama · 12+</div>
    </div>
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-6 flex flex-wrap gap-x-5 gap-y-2">
      {LEGAL_LINKS.map((l) => (
        <a key={l.href} href={l.href} className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800 transition-colors">
          {l.label}
        </a>
      ))}
      <button type="button" onClick={openCookieSettings}
        className="text-[12.5px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800 transition-colors">
        Cookie settings
      </button>
    </div>
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-8 text-[11.5px] leading-relaxed text-ink-400">
      IE Glushakova Marina Sergeevna · INN 672608517020 · OGRNIP 326774600410105 ·{" "}
      <a href="mailto:info@collabrama.ru" className="underline underline-offset-2 hover:text-ink-600">info@collabrama.ru</a>
    </div>
  </footer>
);

// — Cookie consent: banner (reject / accept all / customize) + granular settings panel —

const COOKIE_CATEGORIES = [
  {
    id: "technical",
    title: "Essential (required)",
    locked: true,
    description:
      "The site cannot work without these: authentication and security. Never used for marketing or cross-site tracking.",
    details: [
      ["cf_auth", "signed-in session flag used for routing", "30 days"],
      ["cf_cookie_consent", "your cookie preferences", "1 year"],
      ["creatorflow_token (localStorage)", "CRM and search session token", "until sign-out"],
    ],
  },
  {
    id: "functional",
    title: "Functional",
    description:
      "Remember your interface preferences. Stored only on our servers and in your browser, never shared with third parties.",
    details: [],
    offNote: "Without functional cookies the site will not remember your preferences between visits.",
  },
  {
    id: "analytics",
    title: "Analytics",
    description:
      "Help us understand which sections are used most so we can improve the service. Analytics cookies are not in use right now — if we ever enable them, this page will say so honestly.",
    details: [],
    offNote: "Declining analytics cookies does not limit the site in any way.",
  },
  {
    id: "marketing",
    title: "Marketing",
    description:
      "Make our advertising more relevant. Marketing cookies are not in use right now — we do not share data with ad networks.",
    details: [],
    offNote: "Declining marketing cookies does not limit the site in any way.",
  },
];

const CookieSettingsModal = ({ initial, onClose }) => {
  const [choice, setChoice] = React.useState({
    functional: initial?.functional === true,
    analytics: initial?.analytics === true,
    marketing: initial?.marketing === true,
  });

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const save = () => { saveConsent(choice); onClose(); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Cookie settings">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-[620px] max-h-[88vh] overflow-y-auto p-6 animate-rise">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[19px] font-bold text-ink-900">Cookie settings</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">
              Choose which cookies we may use. Essential cookies are required — the site cannot work without them.
              We remember your choice for one year; you can change it anytime via the “Cookie settings” link in the footer of every page.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center text-ink-600" aria-label="Close">
            <I.Close size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col divide-y divide-ink-100">
          {COOKIE_CATEGORIES.map((cat) => {
            const on = cat.locked || choice[cat.id];
            return (
              <div key={cat.id} className="py-4">
                <label className={`flex items-center gap-2.5 ${cat.locked ? "cursor-default" : "cursor-pointer"}`}>
                  <input type="checkbox" checked={on} disabled={cat.locked}
                    onChange={(e) => setChoice((c) => ({ ...c, [cat.id]: e.target.checked }))}
                    className="w-4 h-4 rounded border-ink-300 accent-indigo-600" />
                  <span className="text-[14px] font-bold text-ink-900">{cat.title}</span>
                </label>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">{cat.description}</p>
                {cat.details.length > 0 && (
                  <div className="mt-2 rounded-xl bg-ink-50/60 border border-ink-100 px-3 py-2">
                    {cat.details.map(([name, purpose, ttl]) => (
                      <div key={name} className="py-1 text-[11.5px] leading-relaxed text-ink-600">
                        <span className="font-mono font-semibold text-ink-800">{name}</span> — {purpose} · <span className="text-ink-400">{ttl}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!on && cat.offNote && (
                  <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                    {cat.offNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button onClick={save} className="btn-primary px-5 h-10 rounded-xl text-[13.5px] font-semibold">Save my choice</button>
          <button onClick={() => { acceptAllConsent(); onClose(); }} className="btn-ghost px-4 h-10 rounded-xl text-[13px] font-medium">Accept all</button>
          <button onClick={() => { rejectAllConsent(); onClose(); }} className="btn-ghost px-4 h-10 rounded-xl text-[13px] font-medium">Reject optional</button>
        </div>
        <div className="mt-3 text-[11.5px] text-ink-400">
          Details in our{" "}
          <a href="/legal/cookie.html" target="_blank" rel="noopener" className="underline underline-offset-2 text-ink-600">cookie policy</a>.
        </div>
      </div>
    </div>
  );
};

const CookieBanner = () => {
  const [consent, setConsentState] = React.useState(() => getConsent());
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  React.useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(CONSENT_SETTINGS_EVENT, open);
    return () => window.removeEventListener(CONSENT_SETTINGS_EVENT, open);
  }, []);

  const decided = (c) => setConsentState(c);

  return (
    <>
      {!consent && !settingsOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[720px] w-[calc(100%-32px)] rounded-2xl border border-ink-100 bg-white shadow-xl px-5 py-4">
          <div className="text-[14.5px] font-bold text-ink-900">We use cookies to make the site work better</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
            Essential cookies keep the site running; everything else is used only with your consent.
            Want to choose yourself?{" "}
            <button type="button" onClick={() => setSettingsOpen(true)} className="underline underline-offset-2 text-ink-800 font-semibold">Customize cookies</button>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => decided(rejectAllConsent())}
              className="px-4 h-9 rounded-lg border border-ink-200 text-ink-700 text-[13px] font-semibold hover:bg-ink-50 transition-colors">
              Reject
            </button>
            <button onClick={() => decided(acceptAllConsent())}
              className="px-4 h-9 rounded-lg bg-ink-900 text-white text-[13px] font-semibold hover:bg-ink-700 transition-colors">
              Accept all cookies
            </button>
          </div>
          <div className="mt-2.5 text-[11px] text-ink-400">
            <a href="/legal/cookie.html" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink-600">Cookie policy</a>
          </div>
        </div>
      )}
      {settingsOpen && (
        <CookieSettingsModal initial={consent} onClose={() => { setSettingsOpen(false); setConsentState(getConsent()); }} />
      )}
    </>
  );
};

export { AudienceSection, UseCasesSection, CompareSection, VisionSection, ObjectionsSection, FinalCTASection, FAQSection, Footer, CookieBanner };
