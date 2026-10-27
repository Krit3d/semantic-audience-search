import React from "react";
import { I } from "../src/icons.jsx";
import { HeroProductMockup } from "../src/mockups.jsx";
import { getCrmLoginUrl, getCrmTrialUrl, isAuthenticated } from "../src/auth.js";
// Header + Hero with interactive search → loading → results.

const Header = ({ onSearch }) => {
  const links = [
    ['Как работает', '#how'],
    ['Возможности', '#features'],
    ['Для кого', '#audience'],
  ];
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`sticky top-0 z-40 transition-shadow ${scrolled ? 'glass shadow-softer' : 'glass'}`}>
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center gap-6">
        <a href="#top" className="flex items-center gap-2 group">
          <Logo />
          <span className="font-bold tracking-tight text-[17px]">Collabrama</span>
        </a>
        <nav className="hidden md:flex items-center gap-1 ml-2"></nav>
        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated() ? (
            <a href="/"
               className="btn-primary inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-4 py-1.5">
              Open the app <I.Arrow size={13} />
            </a>
          ) : (
            <>
              <a href={getCrmLoginUrl()}
                 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 rounded-full px-3 py-1.5 transition-colors">
                Log in
              </a>
              <a href={getCrmTrialUrl()}
                 className="btn-primary inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-4 py-1.5">
                Sign up
              </a>
            </>
          )}
          <a href="/landing"
             className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 border border-ink-200 hover:border-ink-300 bg-white/70 rounded-full pl-2.5 pr-3 py-1.5 transition-colors"
             title="Переключить на русский">
            <I.Globe size={14} className="text-ink-500" />
            EN
          </a>
        </div>
      </div>
    </header>
  );
};

const Logo = () => (
  <span className="w-8 h-8 rounded-xl relative overflow-hidden flex items-center justify-center"
        style={{background:'linear-gradient(135deg, var(--accent), var(--accent-2) 60%, var(--accent-3))'}}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="4.2" />
      <circle cx="15" cy="15" r="4.2" />
    </svg>
  </span>
);

// — search input used in hero and final CTA —
const SearchBox = ({
  defaultValue = "",
  placeholder,
  label = "Describe your campaign task",
  onSubmit,
  big = true,
}) => {
  const [value, setValue] = React.useState(defaultValue);
  const [listening, setListening] = React.useState(false);
  const [voiceSupported, setVoiceSupported] = React.useState(false);
  const ref = React.useRef(null);
  const recRef = React.useRef(null);
  const baseRef = React.useRef("");

  React.useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setVoiceSupported(true);
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      const joined = (baseRef.current ? baseRef.current.trim() + ' ' : '') + text;
      setValue(joined);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.stop(); } catch (e) {} };
  }, []);

  const toggleVoice = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) { try { rec.stop(); } catch (e) {} setListening(false); return; }
    baseRef.current = value;
    try { rec.start(); setListening(true); ref.current?.focus(); } catch (e) {}
  };

  const submit = (e) => { e?.preventDefault?.(); if (!value.trim()) return; onSubmit?.(value.trim()); };
  return (
    <form onSubmit={submit} className="relative">
      <div className="absolute -inset-1 rounded-[28px] opacity-50 pointer-events-none -z-0"
           style={{background:'radial-gradient(closest-side, color-mix(in oklch, var(--accent) 35%, transparent), transparent 70%)'}}/>
      <div className="relative card p-2 sm:p-2.5">
        <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
          <div className="flex items-center gap-2 text-ink-500 text-[12px]">
            <I.Sparkle size={12} className="accent-text"/>
            <span className="mono-mini">{label}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="chip" style={{padding:'2px 8px', fontSize:11}}>Video</span>
            <span className="chip" style={{padding:'2px 8px', fontSize:11}}>Channels</span>
            <span className="chip" style={{padding:'2px 8px', fontSize:11}}>Posts</span>
          </div>
        </div>
        <div className="flex items-start gap-2 px-2 pt-1 pb-2">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
            placeholder={placeholder}
            rows={big ? 5 : 4}
            className="flex-1 resize-none bg-transparent outline-none p-2 text-[14.5px] leading-relaxed placeholder:text-ink-400 text-ink-900"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <div className="flex items-center gap-2">
            {voiceSupported && (
              <button type="button" onClick={toggleVoice}
                title={listening ? 'Stop recording' : 'Voice input'}
                className={`relative inline-flex items-center gap-2 text-[13px] font-medium px-3 py-2.5 rounded-xl border transition-colors
                  ${listening
                    ? 'text-white border-transparent'
                    : 'text-ink-700 bg-white border-ink-200 hover:border-ink-300'}`}
                style={listening ? {background:'var(--accent)'} : null}>
                {listening && (
                  <span className="absolute inset-0 rounded-xl animate-pulse-dot pointer-events-none"
                        style={{boxShadow:'0 0 0 3px color-mix(in oklch, var(--accent) 30%, transparent)'}}/>
                )}
                <I.Mic size={15}/>
                {listening && <span className="hidden sm:inline">Listening…</span>}
              </button>
            )}
          </div>
          <button type="submit" disabled={!value.trim()}
            className="btn-primary inline-flex items-center gap-2 text-[13.5px] font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none">
            <I.Sparkle size={14}/> Find creators
          </button>
        </div>
      </div>
    </form>
  );
};

const Hero = ({ onSearch }) => {
  const placeholder = "For example: A sensitive-skin skincare brand, sold on Amazon. We need creators who genuinely talk about skincare and ingredients, not just “beauty”. Audience — women 25–40, US & UK. Format — an honest review with a texture demo. Tone of voice — calm, no aggressive selling. Budget — up to $500 or barter + promo code.";
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="aurora"/>
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none"/>

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 pt-12 sm:pt-14 lg:pt-16 pb-12 sm:pb-14 lg:pb-16 z-10">
        {/* Floating mockup — tied to the text column so it reads as one construction */}
        <div className="hidden lg:block absolute top-0 pointer-events-none z-0"
             aria-hidden="true"
             style={{ left: 720, right: 0, top: 150, height: 480,
                      WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 8%, black 98%, transparent 100%)',
                      maskImage:       'linear-gradient(90deg, transparent 0%, black 8%, black 98%, transparent 100%)' }}>
          <div className="absolute"
               style={{
                 width: 430,
                 top: 0,
                 left: 20,
                 filter: 'drop-shadow(0 30px 55px rgba(15,18,40,0.14))',
               }}>
            <HeroProductMockup/>
          </div>
        </div>

        <div className="max-w-[680px] relative z-10">
          <h1 className="font-extrabold tracking-[-0.02em] text-[42px] sm:text-[56px] lg:text-[64px] leading-[1.04] text-balance">
            Smart creator matching <span className="grad-text">powered by content analysis</span>
          </h1>
          <p className="mt-5 text-[16.5px] sm:text-[18px] leading-relaxed text-ink-600 max-w-[620px] text-pretty">
            Describe your task — Collabrama finds relevant content creators,
            accounting for what they talk about and how.
          </p>

          <div className="mt-7">
            <SearchBox placeholder={placeholder} onSubmit={onSearch}/>
          </div>
        </div>

        {/* Mobile / tablet: small inline mockup beneath, also illustrative */}
        <div className="lg:hidden mt-12 relative">
          <div className="absolute -inset-3 rounded-[32px] opacity-40 pointer-events-none"
               style={{background:'radial-gradient(closest-side, color-mix(in oklch, var(--accent) 25%, transparent), transparent 70%)'}}/>
          <div className="relative max-w-[420px] mx-auto">
            <HeroProductMockup/>
          </div>
        </div>
      </div>
    </section>
  );
};

// — Waitlist modal: analyzes the request, then collects a contact and emails it —
const WAITLIST_EMAIL = 'omgeveryday@gmail.com';

const SearchModal = ({ open, query, onClose }) => {
  const stages = [
    'Analyzing the product',
    'Selecting platforms',
    'Assessing content meaning',
    'Preparing a creator lineup',
  ];
  const [stageIdx, setStageIdx] = React.useState(0);
  const [ready, setReady] = React.useState(false);      // loading finished → show form
  const [channel, setChannel] = React.useState('telegram');
  const [contact, setContact] = React.useState('');
  const [status, setStatus] = React.useState('idle');   // idle | sending | success | error
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStageIdx(0); setReady(false); setStatus('idle'); setTouched(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= stages.length) {
        clearInterval(id);
        setStageIdx(stages.length);
        setTimeout(() => setReady(true), 400);
      } else {
        setStageIdx(i);
      }
    }, 600);
    return () => clearInterval(id);
  }, [open]);

  // lock scroll + Esc
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const contactValid = contact.trim().length >= 3;

  const buildMailto = () => {
    const subject = 'Collabrama · waitlist request';
    const body =
      'New Collabrama waitlist request\n\n' +
      'Contact channel: ' + (channel === 'telegram' ? 'Telegram' : 'WhatsApp') + '\n' +
      'Contact: ' + contact.trim() + '\n\n' +
      'Creator search request:\n' + (query || '—');
    return 'mailto:' + WAITLIST_EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setTouched(true);
    if (!contactValid || status === 'sending') return;
    setStatus('sending');

    const payload = {
      _subject: 'Collabrama · waitlist request',
      channel: channel === 'telegram' ? 'Telegram' : 'WhatsApp',
      contact: contact.trim(),
      query: query || '—',
    };

    try {
      const res = await fetch('https://formsubmit.co/ajax/' + WAITLIST_EMAIL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('bad status');
      setStatus('success');
    } catch (err) {
      // Fallback: open the user's mail client with everything prefilled.
      try { window.location.href = buildMailto(); } catch (e2) {}
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
         role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative card w-full max-w-[560px] max-h-[88vh] overflow-hidden flex flex-col animate-rise">
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-ink-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <I.Sparkle size={14} className="accent-text"/>
              <span className="mono-mini">Your request</span>
            </div>
            <div className="mt-1.5 text-[13.5px] text-ink-700 line-clamp-2 max-w-[440px]">{query}</div>
          </div>
          <button onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center text-ink-600">
            <I.Close size={16}/>
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5">
          {/* Loading stages */}
          {!ready && (
            <div className="space-y-2">
              {stages.map((s, i) => {
                const st = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
                return (
                  <div key={i}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors
                      ${st==='active' ? 'border-indigo-200 bg-indigo-50/60' :
                        st==='done'   ? 'border-emerald-100 bg-emerald-50/40' :
                                        'border-ink-100 bg-ink-50/40'}`}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
                          style={{background: st==='done' ? '#10b981' : st==='active' ? 'var(--accent)' : '#d5d7e0'}}>
                      {st==='done' ? <I.Check size={11}/> : st==='active' ? <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot"/> : null}
                    </span>
                    <span className={`text-[13.5px] ${st==='pending' ? 'text-ink-400' : 'text-ink-800'}`}>{s}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Waitlist form */}
          {ready && status !== 'success' && (
            <form onSubmit={submit} className="animate-rise">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl accent-soft-bg flex items-center justify-center accent-text shrink-0">
                  <I.Sparkle size={18}/>
                </span>
                <div>
                  <div className="text-[17px] font-bold text-ink-900 leading-snug">Join the waitlist</div>
                  <p className="mt-1 text-[13.5px] text-ink-600 leading-relaxed">
                    We’re opening access gradually. Leave a contact — we’ll send an invite
                    and show a creator lineup for your request.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mono-mini mb-2">Where to reach you</div>
                <div className="grid grid-cols-2 gap-2">
                  {[['telegram','Telegram',<I.Telegram size={14}/>],['whatsapp','WhatsApp',<I.Chat size={14}/>]].map(([val,lab,ic]) => {
                    const active = channel === val;
                    return (
                      <button type="button" key={val} onClick={() => setChannel(val)}
                        className={`inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[13.5px] font-medium transition-colors
                          ${active ? 'border-transparent text-white' : 'border-ink-200 text-ink-700 bg-white hover:border-ink-300'}`}
                        style={active ? {background:'var(--accent)'} : null}>
                        {ic} {lab}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <div className="mono-mini mb-2">{channel === 'telegram' ? 'Telegram handle or link' : 'WhatsApp number'}</div>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={channel === 'telegram' ? '@username or t.me/username' : '+1 555 000-0000'}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-indigo-300"
                />
                {touched && !contactValid && (
                  <div className="mt-1.5 text-[12px] text-rose-500">Please add a contact so we can reply.</div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <div className="mono-mini mb-1">We’ll attach your request</div>
                <div className="text-[12.5px] text-ink-600 leading-relaxed line-clamp-3">{query}</div>
              </div>

              {status === 'error' && (
                <div className="mt-3 text-[12.5px] text-ink-600 leading-relaxed">
                  We couldn’t send it automatically — we’ve opened your mail client with a ready-made email.
                  If nothing appeared, write to us at <span className="font-semibold text-ink-900">{WAITLIST_EMAIL}</span>.
                </div>
              )}

              <button type="submit" disabled={status==='sending'}
                className="btn-primary w-full mt-5 inline-flex items-center justify-center gap-2 text-[14px] font-semibold px-4 py-3 rounded-xl disabled:opacity-70">
                {status==='sending'
                  ? (<><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"/> Sending…</>)
                  : (<><I.Send size={15}/> Join the waitlist</>)}
              </button>

              <p className="mt-3 text-[11.5px] text-ink-400 text-center leading-relaxed">
                By clicking the button, you agree that we may contact you via the details provided.
              </p>
            </form>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="animate-rise text-center py-6">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-white"
                   style={{background:'#10b981'}}>
                <I.Check size={26}/>
              </div>
              <div className="mt-4 text-[19px] font-bold text-ink-900">You’re on the waitlist</div>
              <p className="mt-2 text-[14px] text-ink-600 leading-relaxed max-w-[400px] mx-auto">
                We’ve received your request and your {channel === 'telegram' ? 'Telegram' : 'WhatsApp'} contact.
                We’ll reach out as soon as we open access and prepare a creator lineup.
              </p>
              <button onClick={onClose} className="btn-ghost mt-6 px-4 py-2.5 rounded-xl text-[13.5px] font-medium">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { Header, Logo, SearchBox, Hero, SearchModal, WAITLIST_EMAIL };
