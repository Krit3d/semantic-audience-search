import React from "react";
import { Header, Hero, SearchModal } from "./hero.jsx";
import { PainSection, SolutionSection, SemanticSection } from "./sections.jsx";
import { AudienceSection, UseCasesSection, ObjectionsSection, FinalCTASection, Footer, CookieBanner } from "./sections2.jsx";
// Main app: wires sections + search modal + Tweaks panel.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "indigo",
  "density": "comfortable",
  "showGrid": true
}/*EDITMODE-END*/;

const PALETTES = {
  indigo: { name:'Indigo',    a:'#6366f1', a2:'#8b5cf6', a3:'#3b82f6', soft:'#eef0ff' },
  violet: { name:'Violet',    a:'#8b5cf6', a2:'#a855f7', a3:'#6366f1', soft:'#f3effe' },
  electric:{ name:'Electric', a:'#3b82f6', a2:'#6366f1', a3:'#06b6d4', soft:'#eaf2ff' },
  graphite:{ name:'Graphite', a:'#475569', a2:'#64748b', a3:'#94a3b8', soft:'#eef0f4' },
};

function App() {
  const tweaks = TWEAK_DEFAULTS;
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // apply palette via CSS vars
  React.useEffect(() => {
    const p = PALETTES[tweaks.palette] || PALETTES.indigo;
    const r = document.documentElement;
    r.style.setProperty('--accent',   p.a);
    r.style.setProperty('--accent-2', p.a2);
    r.style.setProperty('--accent-3', p.a3);
    r.style.setProperty('--accent-soft', p.soft);
  }, [tweaks.palette]);

  // density just nudges some vertical rhythm via a body class
  React.useEffect(() => {
    document.body.classList.toggle('density-compact', tweaks.density === 'compact');
  }, [tweaks.density]);

  const openSearch = (q) => {
    setQuery(q || "Skincare on Amazon, women 25–40, US & UK, format — review/integration, budget up to $500 or barter");;
    setSearchOpen(true);
  };

  return (
    <>
      <Header onSearch={() => openSearch()} />
      <main>
        <Hero onSearch={openSearch} />
        <AudienceSection />
        <PainSection />
        <SolutionSection />
        <SemanticSection />
        <UseCasesSection />
        <ObjectionsSection />
        <FinalCTASection onSearch={openSearch} />
      </main>
      <Footer onSearch={() => openSearch()} />
      <CookieBanner />

      <SearchModal open={searchOpen} query={query} onClose={() => setSearchOpen(false)} />

      {/* density + grid effects via style */}
      <style>{`
        body.density-compact section { padding-top: 56px; padding-bottom: 56px; }
        body.density-compact h2 { font-size: 30px !important; }
        ${tweaks.showGrid ? '' : '.grid-bg { display: none !important; }'}
      `}</style>
    </>
  );
}

export default App;
