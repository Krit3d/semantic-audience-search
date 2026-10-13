export type Social = 'Instagram' | 'VK' | 'Telegram' | 'TikTok' | 'YouTube' | 'Дзен';

export interface Author {
  id: string; nick: string; social: Social; followers: number; niche: string;
  reach: number; cpm: number; er: number; roas: number;
  status: 'Свободен' | 'В сделке' | 'В архиве'; hue: number; deals: number;
  twentyId?: string;
  title?: string;
  source?: 'search' | 'manual' | string;
  accountStatus?: string;
}

export interface Product { name: string; desc: string; tags: string[]; hue: number }
export interface PayType { id: string; label: string; on: boolean; rate: string; def?: boolean }

export interface Brand {
  id: string; name: string; letter: string; hue: number; category: string; site: string;
  desc: string; shortDesc: string; status: 'Активен' | 'Черновик';
  products: Product[]; usp: string[]; colors: string[]; fonts: string; logoRules: string;
  tovTraits: string[]; tovPhrases: string[]; tovForbidden: string[];
  allowed: string[]; forbidden: string[]; mentions: string[]; payTypes: PayType[];
}

export interface DealMsg { id: string; from: 'author' | 'user' | 'system'; text: string; time: string }

export interface Deal {
  id: string; title: string; brandId: string; authorId: string; budget: number;
  type: 'Stories' | 'Reels' | 'Пост' | 'Видео';
  stage: number; date: string; pubDate: string;
  msgs: DealMsg[]; file?: string; erid?: string;
  desc: string; terms: string; exclusive: boolean; edits: number;
  authorSummary?: { id: string; platform: string; username: string | null; title: string; subscribers_count: number | null; static_avg_er: number | null; category_path: string | null } | null;
}

export interface Template { id: string; name: string; desc: string; preview: string[]; badge?: string }

export const STAGES = [
  { id: 7, name: 'Шорт-лист', color: '#8B5CF6', soft: '#F5F3FF' },
  { id: 1, name: 'Первичный контакт', color: '#64748B', soft: '#F1F5F9' },
  { id: 2, name: 'Переговоры', color: '#F97316', soft: '#FFF7ED' },
  { id: 3, name: 'Согласование ТЗ', color: '#F59E0B', soft: '#FFFBEB' },
  { id: 4, name: 'Подписание договора', color: '#6366F1', soft: '#EEF2FF' },
  { id: 5, name: 'Доставка', color: '#0EA5E9', soft: '#F0F9FF' },
  { id: 6, name: 'Контент создан', color: '#10B981', soft: '#ECFDF5' },
];

export const SHORTLIST_STAGE = 7;

export interface Stage {
  id: number;
  name: string;
  color: string;
  soft: string;
}

export const ARCHIVED_STAGE: Stage = { id: 0, name: 'В архиве', color: '#94A3B8', soft: '#F8FAFC' };

export const getStage = (stage: number): Stage => {
  const found = STAGES.find(x => x.id === stage);
  if (found) return found;
  if (stage === 0) return ARCHIVED_STAGE;
  return { id: stage, name: 'Неизвестно', color: '#94A3B8', soft: '#F8FAFC' };
};

export const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
export const fmtNum = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + 'M'
    : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + 'K'
      : String(n);

export const TEMPLATES: Template[] = [
  {
    id: 't1', name: 'Договор оказания услуг', badge: 'Рекомендуем',
    desc: 'Универсальный договор на создание рекламного контента с обязательной маркировкой по 38-ФЗ',
    preview: ['г. Москва', 'Исполнитель обязуется оказать Заказчику услуги по созданию и размещению рекламных материалов…', 'Оплата производится в течение 10 рабочих дней после подписания Акта оказанных услуг'],
  },
  {
    id: 't2', name: 'Авторский договор',
    desc: 'Передача исключительных прав на созданный рекламный контент',
    preview: ['Автор передаёт Заказчику исключительные права на материалы в полном объёме…', 'Вознаграждение составляет фиксированную сумму, указанную в п. 3.1'],
  },
  {
    id: 't3', name: 'Лицензионный договор',
    desc: 'Предоставление права использования контента на срок кампании',
    preview: ['Лицензиар предоставляет Лицензиату право использования на 6 месяцев…', 'Территория использования: Российская Федерация'],
  },
  {
    id: 't4', name: 'Договор с рекламным агентством',
    desc: 'Рамочный договор для работы через агентство-посредника',
    preview: ['Агентство действует от имени и по поручению Рекламодателя…', 'Комиссия Агентства составляет 10% от бюджета Кампании'],
  },
];

export const hashHue = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
};

const platformToSocial = (platform: string | null | undefined): Social => {
  switch ((platform ?? '').toLowerCase()) {
    case 'telegram': return 'Telegram';
    case 'youtube': return 'YouTube';
    case 'tiktok': return 'TikTok';
    case 'vk': return 'VK';
    default: return 'Instagram';
  }
};

export const resolveAuthor = (deal: Deal): Pick<Author, 'nick' | 'social' | 'hue' | 'followers' | 'er'> => {
  const s = deal.authorSummary;
  const raw = s ? (s.username || s.title) : deal.authorId;
  return {
    nick: raw.startsWith('@') ? raw : '@' + raw,
    social: platformToSocial(s?.platform),
    hue: hashHue(String(s?.id ?? deal.authorId)),
    followers: s?.subscribers_count || 0,
    er: s?.static_avg_er || 0,
  };
};
