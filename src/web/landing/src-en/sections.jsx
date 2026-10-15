import React from "react";
import { I } from "../src/icons.jsx";
import { SemanticCompare, OutreachMockup, PipelineMockup } from "../src/mockups.jsx";
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
  { i: <I.Clock size={16} />, title: 'Search takes hours',
    text: 'Creators are found through Telegram channels, referrals, old spreadsheets, social search and endless manual scrolling.' },
  { i: <I.Eye size={16} />, title: 'Selection is subjective',
    text: 'Picks are made by the cover (category / follower count) rather than by the meaning of the content.' },
  { i: <I.Chat size={16} />, title: 'Conversations scatter',
    text: 'Telegram, Instagram, email, notes and spreadsheets quickly turn a campaign into chaos.' },
  { i: <I.Sparkle size={16} />, title: 'Follow-ups get forgotten',
    text: 'You have to remember who to ping again, who asked for a brief, who named a price, who went quiet and who to nudge.' },
  { i: <I.Coin size={16} />, title: 'Terms are hard to compare',
    text: 'Price, format, deadline, barter, CPM, CPA or post-payment all live in different chats.' },
  { i: <I.Spreadsheet size={16} />, title: 'Knowledge never accumulates',
    text: 'After a campaign, what you learned about creators stays with the manager — not inside the company.' }];

  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        title="Once you pass ten creators, the manual process starts to fall apart"
        subtitle="Managers search by hand, build spreadsheets, message everyone individually and keep statuses in their heads. As a result, brands often work not with the best-fit creators, but with whoever they managed to find and who replied." />
      
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
            The problem isn't a shortage of creators.
            <span className="grad-text"> The problem is a process that's too manual</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-600 text-pretty max-w-[640px]">
            Influencer marketing is growing, but it scales slowly — because search, selection,
            communication, terms and analytics still rest on managers, spreadsheets and chat threads.
          </p>
        </div>
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-ink-100 bg-white/70 backdrop-blur p-5">
            <div className="mono-mini">The thesis</div>
            <p className="mt-2.5 text-[16px] leading-relaxed font-medium text-ink-900">
              Collabrama turns buying creator ads into a manageable pipeline:
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {['search', 'shortlist', 'messages', 'replies', 'terms', 'placements', 'results'].map((s, i, arr) =>
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
  { t: 'Describe your task', icon: <I.Sliders size={16} /> },
  { t: 'Get relevant creators', icon: <I.Sparkle size={16} /> },
  { t: 'Build a shortlist', icon: <I.Users size={16} /> },
  { t: 'Launch dozens of conversations in parallel', icon: <I.Send size={16} /> },
  { t: 'Track your placements', icon: <I.Pipeline size={16} /> }];

  return (
    <Section id="how" className="py-16 sm:py-20">
      <SectionHead
        title="With Collabrama every deal lives in one process"
        subtitle="Instead of manual search, subjective selection and lost chats — semantic search matched to your product, mass personalized outreach and a single CRM pipeline that keeps the full placement history." />

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
          Hit the audience more precisely <span className="grad-text">— and raise the odds of a relevant response.</span>
        </p>
      </blockquote>
    </div>
    <div className="grid lg:grid-cols-12 gap-10 items-start">
      <div className="lg:col-span-5 lg:sticky lg:top-24">
        <SectionHead
        title="Relevance isn't decided by category — but by how well the meaning of a creator's content matches your product"
        subtitle="A regular database shows creators by category: beauty, lifestyle, fitness. Collabrama analyzes what a creator actually talks about and how, then matches it to your product, audience, visual style and tone of voice — so you find not “creators from a category”, but the ones your product truly fits." />
      </div>
      <div className="lg:col-span-7">
        <SemanticCompare />
      </div>
    </div>
  </Section>;


// — Section 7: relevance by content meaning —
const BrandKBSection = () => {
  const cards = [
  { i: <I.Compass size={15} />, t: 'Meaning of the content', d: 'What a creator really talks about and how — topics, delivery, tone of voice, not just a category.' },
  { i: <I.Layers size={15} />, t: 'Visual style', d: 'How the content looks: aesthetics, format, delivery — whether it matches your brand.' },
  { i: <I.Users size={15} />, t: 'Audience and its interests', d: 'Who the creator speaks to and about what, and how much it overlaps with your buyer.' },
  { i: <I.Sparkle size={15} />, t: 'Product fit', d: 'How naturally your product fits into the creator\u2019s content without feeling forced.' }];

  return (
    <Section className="py-16 sm:py-20">
      <SectionHead
        title="Relevance isn't decided by category — but by how well the meaning of a creator's content matches your product"
        subtitle="Collabrama analyzes what a creator actually talks about and how, then matches it to your product, audience, visual style and tone of voice — so you find not “creators from a category”, but the ones your product truly fits." />

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
          <span className="font-semibold text-ink-900">Hit the audience more precisely </span>
          <I.Arrow size={13} className="inline accent-text mx-1" />
          raise the odds of a relevant response.
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
            title="Not one conversation at a time — dozens of negotiations in parallel"
            subtitle="You set the rules, terms and tone of voice. Collabrama helps launch personalized outreach across your chosen creators and records every reply, price, status and next step." />
        </div>
      </div>
    </Section>);

};

// — Section 9: UTP — CRM pipeline —
const PipelineSection = () =>
<Section className="py-16 sm:py-20">
    <SectionHead
    eyebrow="Placement CRM pipeline"
    title="The whole campaign — as a clear CRM pipeline"
    subtitle="Every creator moves through stages: found, shortlisted, message sent, replied, brief requested, price named, agreed, placement live, result recorded."
    accent />
  
    <div className="mt-10">
      <PipelineMockup />
    </div>
  </Section>;

export { SectionHead, Section, PainSection, InsightSection, SolutionSection, SemanticSection, BrandKBSection, OutreachSection, PipelineSection };
