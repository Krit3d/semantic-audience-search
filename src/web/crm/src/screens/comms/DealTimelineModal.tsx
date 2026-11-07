import { Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, ErrorState } from '../../components/kit';
import { Badge, Btn, Modal } from '../../components/ui';
import { api, type ChannelIdentityItem, type DealActivityItem } from '../../services/api';

const EVENT_LABELS: Record<string, string> = {
  message: 'Сообщение',
  stage_changed: 'Смена этапа',
  channel_blocked: 'Канал заблокирован',
  channel_deleted: 'Канал удалён',
  channel_replaced: 'Канал заменён',
  communication_resumed: 'Коммуникация возобновлена',
};

const CHANNEL_LABELS: Record<string, string> = {
  active: 'Активен',
  blocked: 'Заблокирован',
  deleted: 'Удалён',
  replaced: 'Заменён',
  pending_verification: 'Ожидает проверки',
};

export default function DealTimelineModal({ dealId, dealTitle, onClose }: { dealId: number; dealTitle: string; onClose: () => void }) {
  const [activities, setActivities] = useState<DealActivityItem[]>([]);
  const [channels, setChannels] = useState<ChannelIdentityItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activityItems, channelItems] = await Promise.all([
        api.getDealTimeline(dealId, { limit: 100 }),
        api.getDealChannels(dealId),
      ]);
      setActivities(activityItems);
      setChannels(channelItems);
      setHasMore(activityItems.length === 100);
    } catch {
      setError('Не удалось загрузить историю сделки');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    const oldest = activities[activities.length - 1];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const items = await api.getDealTimeline(dealId, { beforeId: oldest.id, limit: 100 });
      setActivities(current => [...current, ...items]);
      setHasMore(items.length === 100);
    } catch {
      setError('Не удалось загрузить более ранние события');
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleActivities = useMemo(
    () => selectedChannelId === null ? activities : activities.filter(item => item.channel_identity_id === selectedChannelId),
    [activities, selectedChannelId],
  );

  return (
    <Modal onClose={onClose} w="max-w-2xl">
      <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-collab font-semibold text-ink">История сделки</h2>
          <p className="mt-0.5 text-[12px] font-medium text-muted truncate">{dealTitle}</p>
        </div>
        <button type="button" aria-label="Закрыть историю" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="px-5 py-3 border-b border-line">
        <div className="flex flex-wrap gap-1.5" aria-label="Фильтр по каналу">
          <button type="button" aria-pressed={selectedChannelId === null} onClick={() => setSelectedChannelId(null)} className={filterClass(selectedChannelId === null)}>Все каналы</button>
          {channels.map(channel => (
            <button key={channel.id} type="button" aria-pressed={selectedChannelId === channel.id} onClick={() => setSelectedChannelId(channel.id)} className={filterClass(selectedChannelId === channel.id)}>
              {formatChannelName(channel)}
            </button>
          ))}
        </div>
        {channels.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-muted">
            {channels.map(channel => <span key={channel.id}>{formatChannelName(channel)} · {CHANNEL_LABELS[channel.status] ?? channel.status}</span>)}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 py-4">
        {loading && <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-brand-500" /></div>}
        {!loading && error && activities.length === 0 && <ErrorState message={error} onRetry={() => { void load(); }} />}
        {!loading && activities.length > 0 && visibleActivities.length === 0 && <Empty title="Нет событий по каналу" text="Выберите другой канал или все каналы" />}
        {!loading && visibleActivities.length > 0 && (
          <ol className="relative ml-1.5 border-l border-line space-y-4">
            {visibleActivities.map(activity => (
              <li key={activity.id} className="relative pl-5">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={activity.event_type === 'channel_blocked' || activity.event_type === 'channel_deleted' ? 'orange' : 'gray'}>{EVENT_LABELS[activity.event_type] ?? activity.event_type}</Badge>
                  <time className="text-[11px] font-medium text-gray-400" dateTime={activity.created_at}>{formatDateTime(activity.created_at)}</time>
                  {activity.channel_identity_id && <span className="text-[11px] font-semibold text-violet-600">{formatChannelName(channels.find(channel => channel.id === activity.channel_identity_id))}</span>}
                </div>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-gray-700">{activity.description || EVENT_LABELS[activity.event_type] || 'Событие сделки'}</p>
              </li>
            ))}
          </ol>
        )}
        {!loading && !error && activities.length === 0 && <Empty title="История пока пуста" text="Сообщения и изменения сделки появятся здесь" />}
        {error && activities.length > 0 && <p role="alert" className="mt-4 text-[12px] font-semibold text-red-600">{error}</p>}
        {hasMore && selectedChannelId === null && (
          <div className="mt-5 flex justify-center">
            <Btn variant="secondary" size="sm" disabled={loadingMore} onClick={() => { void loadMore(); }}>{loadingMore ? 'Загружаем…' : 'Показать более ранние события'}</Btn>
          </div>
        )}
      </div>
    </Modal>
  );
}

function filterClass(active: boolean): string {
  return 'rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ' + (active ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-slate-50');
}

function formatChannelName(channel?: ChannelIdentityItem): string {
  if (!channel) return 'Канал не указан';
  return `${channel.platform} @${channel.sender_login.replace(/^@/, '')}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
