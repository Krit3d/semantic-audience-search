import type { Deal, Social } from '../data';

export interface CreatorRecord {
  id: string;
  accountid?: string | null;
  accountId?: string | null;
  handle?: string | null;
  username?: string | null;
  name?: string | null;
  Name?: string | null;
  platform?: string | null;
  Platform?: string | null;
  followers?: number | null;
  subscribers_count?: number | null;
  avgreach?: number | null;
  avgReach?: number | null;
  avg_reach?: number | null;
  er?: number | null;
  static_avg_er?: number | null;
  cpm?: number | null;
  niche?: string | null;
  category_path?: string | null;
  status?: string | null;
  hue?: number | null;
  dealscount?: number | null;
  dealsCount?: number | null;
  title?: string | null;
  source?: 'search' | 'manual' | string | null;
  account_status?: string | null;
  accountStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  telegram_commercial?: string | null;
  telegram_personal?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
}

export interface ManualCreatorPayload {
  platform: 'Instagram' | 'Telegram' | string;
  username: string;
  title?: string;
  subscribers_count?: number;
  telegram_commercial?: string;
  telegram_personal?: string;
  email?: string;
  phone?: string;
}

export interface CreatorPostItem {
  id: number;
  platform_content_id: string;
  text: string | null;
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  er: number;
  post_type: string;
  url: string | null;
}

export interface CreatorProfileDetail {
  id: string;
  platform: string;
  username: string | null;
  title: string;
  description: string | null;
  subscribers_count: number;
  static_avg_er: number;
  category_path: string | null;
  country: string | null;
  city: string | null;
  gender: string | null;
  status: string;
  profile_url: string;
  cpm: number;
  avg_reach: number;
  deals_count: number;
  posts: CreatorPostItem[];
  source?: 'search' | 'manual' | string | null;
  account_status?: string | null;
}

export interface LoginResponse {
  token: string;
  user: Record<string, unknown>;
}

export interface CreatorsResponse {
  data: CreatorRecord[];
  total: number;
}

export interface DealAuthorSummary {
  id: string;
  platform: string;
  username: string | null;
  title: string;
  subscribers_count: number | null;
  static_avg_er: number | null;
  category_path: string | null;
}

export interface FileUploadResponse {
  media_url: string;
  media_name: string;
  media_type: string;
  file_size: number;
}

export interface DealMessageItem {
  id: number;
  deal_id?: number | null;
  account_id?: string;
  sender_type: 'user' | 'creator' | 'system' | string;
  text?: string | null;
  is_read: boolean;
  created_at: string;
  channel_type?: string | null;
  channel_target?: string | null;
  external_message_id?: string | null;
  media_url?: string | null;
  media_name?: string | null;
  media_type?: string | null;
}

export interface DealItem {
  id: number;
  user_id: number;
  account_id: string;
  title: string;
  stage: number;
  budget: number;
  type: string;
  brand_name: string | null;
  pub_date: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string;
  author: DealAuthorSummary | null;
  last_message: DealMessageItem | null;
  unread_count: number;
  erid?: string | null;
}

export interface DealCreatePayload {
  account_id: string;
  title: string;
  budget?: number;
  type?: string;
  brand_name?: string | null;
  pub_date?: string | null;
  terms?: string | null;
  initial_message?: string | null;
}

export interface DealUpdatePayload {
  title?: string;
  stage?: number;
  budget?: number;
  type?: string;
  brand_name?: string | null;
  pub_date?: string | null;
  terms?: string | null;
}

export interface AvailableChannelItem {
  channel_type: string;
  channel_target: string;
  role?: string;
}

export interface CommunicationChannelItem {
  id: string;
  deal_id: number | null;
  author_id: string;
  author_name: string;
  author_handle: string;
  platform: string;
  deal_title: string | null;
  stage: number | null;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  is_archived: boolean;
  channel_target?: string | null;
  available_channels?: AvailableChannelItem[];
  channel_type: 'telegram' | 'email' | 'whatsapp' | 'instagram' | string;
}

const TOKEN_KEY = 'creatorflow_token';
const USER_KEY = 'creatorflow_user';

export interface BrandProduct {
  name: string;
  desc: string;
  tags: string[];
  hue: number;
}

export interface BrandPayType {
  label: string;
  on: boolean;
  rate: string;
  def?: boolean;
  custom?: boolean;
}

export interface BrandRequisites {
  company?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  address?: string;
  contact?: string;
  email?: string;
  phone?: string;
}

export interface BrandKb {
  short: string;
  products: BrandProduct[];
  usp: string[];
  allowed: string[];
  forbidden: string[];
  mentions: string[];
  pay_types: BrandPayType[];
  requisites: BrandRequisites;
}

export interface BrandItem {
  id: number;
  name: string;
  category: string;
  status: 'Активен' | 'Черновик' | string;
  hue: number;
  desc: string;
  deals_count: number;
  shortlist_count: number;
  kb: BrandKb;
  created_at: string;
  updated_at: string;
}

export interface BrandPayload {
  name: string;
  category?: string;
  status?: string;
  hue?: number;
  desc?: string;
  kb?: Partial<BrandKb>;
}

export interface EridCheckItem {
  id: number;
  checked_at: string;
  result: string;
  checked_by: string;
}

export interface EridRecord {
  id: number;
  code: string;
  deal_id: number | null;
  deal_title: string | null;
  author_handle: string | null;
  brand_id: number | null;
  brand_name: string | null;
  status: 'Заполняют данные' | 'Активен' | 'Ожидает публикации' | 'Опубликован' | 'Архивирован' | string;
  pub_link: string | null;
  verdict: 'ok' | 'bad' | null;
  created_at: string;
  checks: EridCheckItem[];
}

export interface EridCreatePayload {
  deal_id?: number | null;
  brand_id?: number | null;
  code?: string | null;
}

export interface EridUpdatePayload {
  status?: string;
  pub_link?: string | null;
  verdict?: 'ok' | 'bad' | null;
}

export interface PublicationItem {
  id: number;
  deal_id: number | null;
  author_id: string;
  author_handle: string | null;
  brand_id: number | null;
  brand_name: string | null;
  platform: string;
  type: string;
  text: string;
  published_at: string;
  url: string | null;
  views: number;
  clicks: number;
  revenue: number;
  cost: number;
  erid: string | null;
  sync_status: 'ok' | 'syncing' | 'waiting' | 'error' | string;
}

export interface AnalyticsFunnelStep { stage: number; label: string; count: number }
export interface AnalyticsRevenuePoint { period: string; revenue: number }
export interface AnalyticsTopAuthor { author_id: string; handle: string; revenue: number }
export interface AnalyticsNetwork { platform: string; share: number }

export interface AnalyticsSummary {
  period: string;
  funnel: AnalyticsFunnelStep[];
  revenue: AnalyticsRevenuePoint[];
  top_authors: AnalyticsTopAuthor[];
  networks: AnalyticsNetwork[];
  totals: { revenue: number; deals: number; publications: number; avg_roas: number | null };
}

export interface ShortlistItem {
  account_id: string;
  added_at: string;
  author: DealAuthorSummary | null;
}

export interface SimilarSearchItem {
  account_id: number;
  platform: string;
  username: string | null;
  title: string;
  url: string | null;
  final_score: number;
  static_avg_er: number | null;
  subscribers_count: number | null;
  country: string | null;
  city: string | null;
  primary_language: string | null;
  primary_tone: string | null;
  match_type: string;
  affinity_reason: string | null;
  description: string | null;
}

export interface SimilarSearchResponse {
  items: SimilarSearchItem[];
  total: number;
  message: string | null;
}

export interface CreatorImportPreviewItem {
  row: number;
  username: string | null;
  platform: string | null;
  status: 'new' | 'exists' | 'skip';
  reason: string | null;
}

export interface CreatorImportPreview {
  items: CreatorImportPreviewItem[];
  total: number;
  new_count: number;
  exists_count: number;
  skip_count: number;
}

export interface CreatorImportResult {
  added_count: number;
  skipped_count: number;
}

const ROOT_API_URL = (import.meta.env.VITE_API_URL || 'https://api.collabrama.ru/api/v1').replace(/\/+$/, '');
const API_BASE = `${ROOT_API_URL.replace(/\/crm\/?$/, '')}/crm`;
export const MEDIA_SERVER_BASE = (() => {
  try {
    const raw = import.meta.env.VITE_API_URL || 'https://api.collabrama.ru/api/v1';
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://api.collabrama.ru';
    const parsed = new URL(raw, fallbackOrigin);
    return parsed.origin;
  } catch {
    return '';
  }
})();

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (MEDIA_SERVER_BASE) return `${MEDIA_SERVER_BASE}${normalizedPath}`;
  return normalizedPath;
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, baseUrl: string = API_BASE): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (response.status === 401) {
    api.logout();
    window.dispatchEvent(new CustomEvent('creatorflow:auth_expired'));
    throw new ApiError('Сессия истекла. Пожалуйста, войдите снова.', 401);
  }
  if (!response.ok) {
    let detail = `Ошибка запроса (${response.status})`;
    if (response.status === 403) detail = 'Недостаточно прав для этого действия';
    if (response.status >= 500) detail = 'Сервер временно недоступен. Попробуйте позже';
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string' && response.status !== 403 && response.status < 500) detail = body.detail;
    } catch {
      /* ignore parse failures */
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as T;
}

export interface SupportTicketItem {
  id: number;
  ticket_number: string;
  user_id: number | null;
  email: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketDetail extends SupportTicketItem {
  description: string;
  page_url: string | null;
  user_agent: string | null;
}

export interface SupportTicketListResponse {
  items: SupportTicketItem[];
  total: number;
  page: number;
  page_size: number;
}

function getStoredUser(): Record<string, unknown> | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const api = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  },

  async register(email: string, password: string, name?: string): Promise<LoginResponse> {
    const data = await request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  },

  async getCreators(): Promise<CreatorRecord[]> {
    const data = await request<CreatorsResponse>('/creators');
    return data.data;
  },

  async getCreatorProfile(creatorId: string): Promise<CreatorProfileDetail> {
    return request<CreatorProfileDetail>(`/creators/${encodeURIComponent(creatorId)}`);
  },

  async addCreatorManual(payload: ManualCreatorPayload): Promise<CreatorRecord> {
    return request<CreatorRecord>('/creators/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async exportToCrmShortlist(accountIds: string[], userEmail: string): Promise<{ added_count: number; redirect_url: string }> {
    return request<{ added_count: number; redirect_url: string }>('/shortlist', {
      method: 'POST',
      body: JSON.stringify({ account_ids: accountIds, user_email: userEmail }),
    });
  },

  async exportShortlist(accountIds: string[]): Promise<{ added_count: number; redirect_url: string }> {
    return request<{ added_count: number; redirect_url: string }>('/shortlist', {
      method: 'POST',
      body: JSON.stringify({ account_ids: accountIds }),
    });
  },

  async updateCreatorStatus(creatorId: string, status: string, archiveActiveDeals?: boolean): Promise<CreatorRecord> {
    return request<CreatorRecord>(`/creators/${encodeURIComponent(creatorId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, archive_active_deals: archiveActiveDeals ?? false }),
    });
  },

  async deleteCreator(creatorId: string): Promise<{ status: string; creator_id: string }> {
    return request<{ status: string; creator_id: string }>(`/creators/${encodeURIComponent(creatorId)}`, {
      method: 'DELETE',
    });
  },

  async getDeals(params?: { stage?: number; search?: string }): Promise<DealItem[]> {
    const query = new URLSearchParams();
    if (params?.stage !== undefined) query.set('stage', String(params.stage));
    if (params?.search) query.set('search', params.search);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<DealItem[]>(`/deals${suffix}`);
  },

  async createDeal(payload: DealCreatePayload): Promise<DealItem> {
    return request<DealItem>('/deals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getDeal(dealId: number): Promise<DealItem> {
    return request<DealItem>(`/deals/${dealId}`);
  },

  async updateDeal(dealId: number, payload: DealUpdatePayload): Promise<DealItem> {
    return request<DealItem>(`/deals/${dealId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteDeal(dealId: number): Promise<{ status: string; deal_id: number }> {
    return request<{ status: string; deal_id: number }>(`/deals/${dealId}`, {
      method: 'DELETE',
    });
  },

  async getDealMessages(dealId: number): Promise<DealMessageItem[]> {
    return request<DealMessageItem[]>(`/deals/${dealId}/messages`);
  },

  async sendDealMessage(dealId: number, text: string, senderType: string = 'user'): Promise<DealMessageItem> {
    return request<DealMessageItem>(`/deals/${dealId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, sender_type: senderType }),
    });
  },

  async getCommunications(): Promise<CommunicationChannelItem[]> {
    return request<CommunicationChannelItem[]>('/communications');
  },

  async initCommunication(creatorId: string, channelType?: string): Promise<CommunicationChannelItem> {
    const query = `?creator_id=${encodeURIComponent(creatorId)}${channelType ? `&channel_type=${encodeURIComponent(channelType)}` : ''}`;
    return request<CommunicationChannelItem>(`/communications/init${query}`, {
      method: 'POST',
    });
  },

  async getCreatorMessages(creatorId: string, channelType?: string): Promise<DealMessageItem[]> {
    const query = channelType ? `?channel_type=${encodeURIComponent(channelType)}` : '';
    return request<DealMessageItem[]>(`/creators/${encodeURIComponent(creatorId)}/messages${query}`);
  },

  async uploadChatFile(file: File): Promise<FileUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}/upload`, { method: 'POST', headers, body: form });
    if (response.status === 401) {
      api.logout();
      window.dispatchEvent(new CustomEvent('creatorflow:auth_expired'));
      throw new ApiError('Сессия истекла. Пожалуйста, войдите снова.', 401);
    }
    if (!response.ok) {
      let detail = `Ошибка запроса (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === 'string') detail = body.detail;
      } catch {
        /* ignore parse failures */
      }
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as FileUploadResponse;
  },

  async sendCreatorMessage(creatorId: string, text?: string | null, senderType: string = 'user', media?: { media_url: string; media_name: string; media_type: string }, preferredChannel?: string): Promise<DealMessageItem> {
    return request<DealMessageItem>(`/creators/${encodeURIComponent(creatorId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        text: text?.trim() || null,
        sender_type: senderType,
        media_url: media?.media_url || null,
        media_name: media?.media_name || null,
        media_type: media?.media_type || null,
        preferred_channel: preferredChannel || null,
      }),
    });
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new CustomEvent('creatorflow:logout'));
  },

  isAuthenticated(): boolean {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  },

  saveSession(token: string, user: Record<string, unknown>): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  updateUser(user: Record<string, unknown>): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  async getMe(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('/auth/me');
  },

  getCurrentUser(): Record<string, unknown> | null {
    return getStoredUser();
  },

  getToken(): string {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  },

  async getTickets(params: { status?: string; category?: string; page?: number; pageSize?: number } = {}): Promise<SupportTicketListResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.category) query.set('category', params.category);
    query.set('page', String(params.page ?? 1));
    query.set('page_size', String(params.pageSize ?? 20));
    return request<SupportTicketListResponse>(`/support/tickets?${query.toString()}`, {}, ROOT_API_URL);
  },

  async getTicket(ticketId: number): Promise<SupportTicketDetail> {
    return request<SupportTicketDetail>(`/support/tickets/${ticketId}`, {}, ROOT_API_URL);
  },

  async updateTicketStatus(ticketId: number, status: string): Promise<SupportTicketItem> {
    return request<SupportTicketItem>(`/support/tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }, ROOT_API_URL);
  },

  async bulkTickets(ticketIds: number[], action: 'delete' | 'set_status', status?: string): Promise<number> {
    const data = await request<{ affected: number }>('/support/tickets/bulk', {
      method: 'POST',
      body: JSON.stringify({ ticket_ids: ticketIds, action, status }),
    }, ROOT_API_URL);
    return data.affected;
  },

  async deleteTicket(ticketId: number): Promise<void> {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${ROOT_API_URL}/support/tickets/${ticketId}`, { method: 'DELETE', headers });
    if (response.status === 401) {
      api.logout();
      window.dispatchEvent(new CustomEvent('creatorflow:auth_expired'));
      throw new ApiError('Сессия истекла. Пожалуйста, войдите снова.', 401);
    }
    if (!response.ok) {
      let detail = `Ошибка запроса (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === 'string') detail = body.detail;
      } catch {
        /* ignore parse failures */
      }
      throw new ApiError(detail, response.status);
    }
  },

  async getBrands(): Promise<BrandItem[]> {
    return request<BrandItem[]>('/brands');
  },

  async getBrand(brandId: number): Promise<BrandItem> {
    return request<BrandItem>(`/brands/${brandId}`);
  },

  async createBrand(payload: BrandPayload): Promise<BrandItem> {
    return request<BrandItem>('/brands', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateBrand(brandId: number, payload: BrandPayload): Promise<BrandItem> {
    return request<BrandItem>(`/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async deleteBrand(brandId: number): Promise<{ status: string; brand_id: number }> {
    return request<{ status: string; brand_id: number }>(`/brands/${brandId}`, { method: 'DELETE' });
  },

  async getEridRecords(params: { brandId?: number; status?: string } = {}): Promise<EridRecord[]> {
    const query = new URLSearchParams();
    if (params.brandId !== undefined) query.set('brand_id', String(params.brandId));
    if (params.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<EridRecord[]>(`/erid${suffix}`);
  },

  async createEridRecord(payload: EridCreatePayload): Promise<EridRecord> {
    return request<EridRecord>('/erid', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateEridRecord(recordId: number, payload: EridUpdatePayload): Promise<EridRecord> {
    return request<EridRecord>(`/erid/${recordId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async addEridCheck(recordId: number, result: string): Promise<EridRecord> {
    return request<EridRecord>(`/erid/${recordId}/checks`, { method: 'POST', body: JSON.stringify({ result }) });
  },

  async getPublications(params: { brandId?: number } = {}): Promise<PublicationItem[]> {
    const query = new URLSearchParams();
    if (params.brandId !== undefined) query.set('brand_id', String(params.brandId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<PublicationItem[]>(`/publications${suffix}`);
  },

  async getAnalyticsSummary(params: { period?: string; brandId?: number } = {}): Promise<AnalyticsSummary> {
    const query = new URLSearchParams();
    if (params.period) query.set('period', params.period);
    if (params.brandId !== undefined) query.set('brand_id', String(params.brandId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<AnalyticsSummary>(`/analytics/summary${suffix}`);
  },

  async getShortlist(): Promise<ShortlistItem[]> {
    return request<ShortlistItem[]>('/shortlist');
  },

  async removeFromShortlist(accountId: string): Promise<{ status: string; account_id: string }> {
    return request<{ status: string; account_id: string }>(`/shortlist/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
  },

  async findSimilarAuthors(accountIds: string[]): Promise<SimilarSearchResponse> {
    return request<SimilarSearchResponse>('/search/similar', {
      method: 'POST',
      body: JSON.stringify({ account_ids: accountIds }),
    }, ROOT_API_URL);
  },

  async previewCreatorsImport(file: File): Promise<CreatorImportPreview> {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}/creators/import/preview`, { method: 'POST', headers, body: form });
    if (response.status === 401) {
      api.logout();
      window.dispatchEvent(new CustomEvent('creatorflow:auth_expired'));
      throw new ApiError('Сессия истекла. Пожалуйста, войдите снова.', 401);
    }
    if (!response.ok) {
      let detail = `Ошибка запроса (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === 'string') detail = body.detail;
      } catch {
        /* ignore parse failures */
      }
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as CreatorImportPreview;
  },

  async commitCreatorsImport(items: { username: string; platform: string }[]): Promise<CreatorImportResult> {
    return request<CreatorImportResult>('/creators/import/commit', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

export function mapDealItemToDeal(item: DealItem): Deal {
  const authorTitle = item.author ? (item.author.username || item.author.title) : '';
  return {
    id: String(item.id),
    title: item.title || authorTitle,
    brandId: item.brand_name ? String(item.brand_name) : 'b1',
    authorId: String(item.account_id),
    authorSummary: item.author,
    budget: item.budget,
    stage: item.stage,
    date: new Date(item.created_at).toLocaleDateString('ru-RU'),
    pubDate: item.pub_date || new Date(item.created_at).toLocaleDateString('ru-RU'),
    type: item.type as Deal['type'],
    msgs: item.last_message ? [{ id: String(item.last_message.id), from: item.last_message.sender_type === 'creator' ? 'author' : 'user', text: item.last_message.text || '', time: new Date(item.last_message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }] : [],
    desc: item.terms || '',
    terms: item.terms || `Фиксированная оплата ${item.budget} ₽`,
    exclusive: false,
    edits: 2,
    erid: item.erid ?? undefined,
  };
}

export function userName(user: Record<string, unknown> | null): string {
  if (!user) return '';
  const email = typeof user.email === 'string' ? user.email : '';
  const name = typeof user.name === 'string' && user.name ? user.name : '';
  return name || email;
}

export function userHandle(user: Record<string, unknown> | null): string {
  const email = typeof user?.email === 'string' && user.email ? user.email : '';
  return email ? '@' + email.split('@')[0] : '';
}

export const STATUS_OPTIONS: string[] = ['Свободен', 'В сделке', 'В архиве'];

export function normalizeSocial(raw: string | null | undefined): Social {
  const value = (raw ?? '').trim();
  const lower = value.toLowerCase();
  if (lower === 'instagram') return 'Instagram';
  if (lower === 'youtube') return 'YouTube';
  if (lower === 'telegram') return 'Telegram';
  if (lower === 'tiktok') return 'TikTok';
  if (lower === 'vk' || lower === 'вконтакте') return 'VK';
  return 'Дзен';
}
