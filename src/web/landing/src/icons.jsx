// Lightweight inline icons (stroke-based, single weight)
const Icon = ({ d, size = 18, className = "", strokeWidth = 1.6, fill = "none", children, viewBox = "0 0 24 24" }) => (
  <svg
    width={size} height={size} viewBox={viewBox}
    fill={fill} stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    {d ? <path d={d} /> : children}
  </svg>
);

const I = {
  Search:    (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Sparkle:   (p) => <Icon {...p}><path d="M12 3 13.8 9 20 10.8 13.8 12.6 12 19 10.2 12.6 4 10.8 10.2 9z"/><path d="M19 4l.7 2 2 .7-2 .7L19 9l-.7-1.6-2-.7 2-.7z"/></Icon>,
  Arrow:     (p) => <Icon {...p}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></Icon>,
  Check:     (p) => <Icon {...p}><path d="m5 12 4 4 10-10"/></Icon>,
  Close:     (p) => <Icon {...p}><path d="m6 6 12 12"/><path d="m18 6-12 12"/></Icon>,
  Plus:      (p) => <Icon {...p}><path d="M12 5v14"/><path d="M5 12h14"/></Icon>,
  Minus:     (p) => <Icon {...p}><path d="M5 12h14"/></Icon>,
  Filter:    (p) => <Icon {...p}><path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/></Icon>,
  Bolt:      (p) => <Icon {...p}><path d="M13 3 4 14h7l-1 7 9-11h-7z"/></Icon>,
  Pipeline:  (p) => <Icon {...p}><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></Icon>,
  Chat:      (p) => <Icon {...p}><path d="M4 6.5C4 5.7 4.7 5 5.5 5h13c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5H9l-4 3v-3H5.5C4.7 16 4 15.3 4 14.5z"/></Icon>,
  Brain:     (p) => <Icon {...p}><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8V13a3 3 0 0 0 3 3v2a2 2 0 0 0 4 0V6a2 2 0 0 0-2-2z"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8V13a3 3 0 0 1-3 3v2a2 2 0 0 1-4 0V6a2 2 0 0 1 2-2z"/></Icon>,
  Compass:   (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-4 0 2-6z"/></Icon>,
  Layers:    (p) => <Icon {...p}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></Icon>,
  Users:     (p) => <Icon {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M21 18c0-2.4-2-4-4-4"/></Icon>,
  Store:     (p) => <Icon {...p}><path d="M4 9 6 4h12l2 5"/><path d="M4 9v10h16V9"/><path d="M4 9c0 1.8 1.3 3 3 3s3-1.2 3-3c0 1.8 1.3 3 3 3s3-1.2 3-3c0 1.8 1.3 3 3 3"/></Icon>,
  Briefcase: (p) => <Icon {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></Icon>,
  Trend:     (p) => <Icon {...p}><path d="m3 17 6-6 4 4 8-9"/><path d="M14 6h7v7"/></Icon>,
  Clock:     (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Question:  (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></Icon>,
  Spreadsheet:(p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></Icon>,
  Tag:       (p) => <Icon {...p}><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/></Icon>,
  Eye:       (p) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Coin:      (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M9 14c.6.8 1.7 1.3 3 1.3 1.7 0 3-.9 3-2 0-2.5-6-1.4-6-4 0-1.1 1.3-2 3-2 1.3 0 2.4.5 3 1.3"/><path d="M12 6.5v11"/></Icon>,
  Lock:      (p) => <Icon {...p}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></Icon>,
  Globe:     (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></Icon>,
  Send:      (p) => <Icon {...p}><path d="m4 12 16-8-6 16-2-7z"/></Icon>,
  Sliders:   (p) => <Icon {...p}><path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2"/><path d="M10 12h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/></Icon>,
  Telegram:  (p) => <Icon {...p}><path d="M21 4 3 11l5 2 2 6 3-4 5 4z"/></Icon>,
  Tiktok:    (p) => <Icon {...p}><path d="M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.5 4 5 4"/></Icon>,
  Instagram: (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></Icon>,
  Youtube:   (p) => <Icon {...p}><rect x="3" y="6" width="18" height="12" rx="3"/><path d="m11 9 5 3-5 3z" fill="currentColor"/></Icon>,
  Mail:      (p) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></Icon>,
  Dot:       (p) => <Icon {...p}><circle cx="12" cy="12" r="3" fill="currentColor"/></Icon>,
  Mic:       (p) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></Icon>,
};

export { Icon, I };
