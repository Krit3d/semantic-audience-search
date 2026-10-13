import { Archive, ArchiveRestore, Briefcase, Check, ChevronDown, Download, FileText, ImageOff, Loader2, Paperclip, Plus, Search, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SocialIcon } from '../../components/icons';
import { Empty, ErrorState, SkeletonLines } from '../../components/kit';
import { Avatar, Badge, Btn, inputCls, Modal, Tip, useToast } from '../../components/ui';
import { fmtMoney, getStage, type Author, type Deal, type DealMsg, type Social } from '../../data';
import { api, normalizeSocial, resolveMediaUrl, type CommunicationChannelItem, type CreatorRecord, type DealMessageItem, type FileUploadResponse } from '../../services/api';

const STAGE_TONES: Record<number, string> = {
  6: 'green',
  5: 'sky',
  4: 'indigo',
  3: 'amber',
  2: 'orange',
  1: 'gray',
  0: 'gray',
};

function getChannelBadge(channelType?: string | null): { label: string; tone: 'sky' | 'amber' | 'green' | 'violet' } {
  switch (channelType?.toLowerCase()) {
    case 'telegram':
      return { label: 'Канал: Telegram', tone: 'sky' };
    case 'email':
      return { label: 'Канал: E-mail', tone: 'amber' };
    case 'whatsapp':
      return { label: 'Канал: WhatsApp', tone: 'green' };
    case 'instagram':
    default:
      return { label: 'Канал: Instagram', tone: 'violet' };
  }
}

function formatChannelName(channelType?: string | null): string {
  switch (channelType?.toLowerCase()) {
    case 'internal':
    case '': return 'Instagram Direct';
    case 'telegram': return 'Telegram';
    case 'instagram': return 'Instagram Direct';
    case 'email': return 'E-mail';
    case 'whatsapp': return 'WhatsApp';
    default: return channelType || 'Instagram Direct';
  }
}

const channelToneClasses: Record<string, string> = {
  telegram: 'border-sky-200 bg-sky-50 text-sky-700',
  instagram: 'border-violet-200 bg-violet-50 text-violet-700',
  email: 'border-amber-200 bg-amber-50 text-amber-700',
  whatsapp: 'border-green-200 bg-green-50 text-green-700',
};

export type CommsMessage = DealMsg & {
  media_url?: string | null;
  media_name?: string | null;
  media_type?: string | null;
};

const channelKey = (channel: CommunicationChannelItem): string => channel.id || `${channel.author_id}:${channel.channel_type}`;

function ChatImage({ src, alt }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-xl bg-black/10 text-[11.5px] font-medium text-current/80 mb-1.5">
        <ImageOff size={14} className="shrink-0 opacity-70" />
        <span className="truncate">Изображение недоступно</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt || "Вложение"}
      onError={() => setFailed(true)}
      className="max-w-full max-h-64 rounded-xl object-cover mb-1.5 cursor-pointer"
      onClick={() => window.open(src, "_blank")}
    />
  );
}

function VideoPlayer({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-xl bg-black/10 text-[11.5px] font-medium text-current/80 mb-1.5">
        <ImageOff size={14} className="shrink-0 opacity-70" />
        <span className="truncate">Видеофайл недоступен</span>
      </div>
    );
  }
  return (
    <video controls src={src} onError={() => setFailed(true)} className="max-w-full max-h-64 rounded-xl mb-1.5" />
  );
}

export default function CommsScreen({ deals, onOpenDeal, initialAuthorId, onNewDeal }: { deals: Deal[]; onOpenDeal?: (id: string) => void; initialAuthorId?: string | null; onNewDeal?: (authorId: string, meta?: { name?: string; handle?: string }) => void }) {
  const toast = useToast();
  const [channels, setChannels] = useState<CommunicationChannelItem[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [activeChannelType, setActiveChannelType] = useState<string>('instagram');
  const [msgs, setMsgs] = useState<CommsMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [chatTab, setChatTab] = useState<'active' | 'archived'>('active');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [closeDeals, setCloseDeals] = useState(true);
  const [attachedFile, setAttachedFile] = useState<FileUploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const channelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (channelMenuRef.current && !channelMenuRef.current.contains(event.target as Node)) setChannelMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const loadChannels = useCallback(() => {
    let cancelled = false;
    setChannelsLoading(true);
    setChannelsError(null);
    api.getCommunications()
      .then(items => {
        if (cancelled) return;
        setChannelsLoading(false);
        if (initialAuthorId) {
          const target = items.find(c => String(c.author_id) === String(initialAuthorId));
          if (target) {
            setChannels(items);
            setSelectedAuthorId(String(target.author_id));
            setChatTab(target.is_archived ? 'archived' : 'active');
          } else {
            api.initCommunication(initialAuthorId)
              .then(channel => {
                if (cancelled) return;
                setChannels([channel, ...items]);
                setSelectedAuthorId(String(channel.author_id));
                setChatTab(channel.is_archived ? 'archived' : 'active');
              })
              .catch(() => {
                if (cancelled) return;
                api.getCreatorProfile(initialAuthorId)
                  .then(profile => {
                    if (cancelled) return;
                    const isArchived = profile.status === 'В архиве' || profile.status === 'ARCHIVED';
                    const temp: CommunicationChannelItem = {
                      id: `${initialAuthorId}:instagram`,
                      deal_id: null,
                      author_id: initialAuthorId,
                      author_name: profile.title,
                      author_handle: profile.username ? `@${stripAt(profile.username)}` : `@${profile.title}`,
                      platform: profile.platform,
                      deal_title: 'Новый контакт',
                      stage: 1,
                      last_message: 'Диалог не начат',
                      last_message_time: new Date().toISOString(),
                      unread_count: 0,
                      is_archived: isArchived,
                      channel_type: 'instagram',
                    };
                    setChannels([temp, ...items]);
                    setSelectedAuthorId(String(temp.author_id));
                    setChatTab(isArchived ? 'archived' : 'active');
                  })
                  .catch(() => {
                    if (cancelled) return;
                    setChannels(items);
                    setSelectedAuthorId(items.length > 0 ? String(items[0].author_id) : null);
                  });
              });
          }
        } else {
          setChannels(items);
          setSelectedAuthorId(prev => prev ?? (items.length > 0 ? String(items[0].author_id) : null));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setChannelsLoading(false);
        setChannelsError('Не удалось загрузить каналы');
        toast('err', 'Не удалось загрузить каналы');
      });
    return () => { cancelled = true; };
  }, [initialAuthorId]);

  useEffect(() => loadChannels(), [loadChannels]);

  const uniqueChannels = useMemo(() => Array.from(new Map(channels.map(channel => [String(channel.author_id), channel])).values()), [channels]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return uniqueChannels.filter(c => {
      if (chatTab === 'active' ? c.is_archived : !c.is_archived) return false;
      if (!s) return true;
      return c.author_name.toLowerCase().includes(s) || c.author_handle.toLowerCase().includes(s);
    });
  }, [uniqueChannels, q, chatTab]);

  const activeCount = useMemo(() => channels.filter(c => !c.is_archived).length, [channels]);
  const archivedCount = useMemo(() => channels.filter(c => c.is_archived).length, [channels]);

  const ch = filtered.find(c => String(c.author_id) === selectedAuthorId) ?? filtered[0] ?? null;
  const a = ch ? channelAuthor(ch) : null;
  const targetDeal = ch ? deals.find(d => (d.authorId === String(ch.author_id) || d.id === String(ch.deal_id)) && d.stage >= 1 && d.stage <= 6) : undefined;
  const activeDeals = ch ? deals.filter(d => (d.authorId === String(ch.author_id) || d.id === String(ch.deal_id)) && d.stage >= 1 && d.stage <= 6) : [];
  const activeBudget = activeDeals.reduce((acc, d) => acc + d.budget, 0);

  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveChannelType(ch?.channel_type && ch.channel_type !== 'internal' ? ch.channel_type : 'instagram');
  }, [ch?.author_id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, selectedAuthorId]);

  useEffect(() => {
    if (!ch) return;
    const authorId = String(ch.author_id);
    let isMounted = true;
    setMsgs([]);
    setMessagesLoading(true);
    setMessagesError(null);

    const fetchMessages = () => {
      api.getCreatorMessages(authorId, activeChannelType)
        .then(items => {
          if (!isMounted) return;
          setMessagesLoading(false);
          setMessagesError(null);
          const mapped = items.map(toDealMsg);
          setMsgs(prev => {
            if (prev.length === mapped.length && prev[prev.length - 1]?.id === mapped[mapped.length - 1]?.id) {
              return prev;
            }
            return mapped;
          });
          if (items.length > 0) {
            const last = items[items.length - 1];
            setChannels(prev => prev.map(c => {
              if (channelKey(c) !== channelKey(ch)) return c;
              return {
                ...c,
                last_message: last.text || '',
                last_message_time: last.created_at,
                unread_count: 0,
              };
            }));
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setMessagesLoading(false);
          setMessagesError('Не удалось загрузить сообщения');
        });
    };

    fetchMessages();
    const timer = setInterval(fetchMessages, 4000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [ch?.author_id, activeChannelType]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    api.uploadChatFile(file)
      .then(result => {
        setAttachedFile(result);
        if (fileInputRef.current) fileInputRef.current.value = '';
        toast('ok', `Файл "${file.name}" прикреплен`);
      })
      .catch(() => toast('err', 'Ошибка загрузки файла'))
      .finally(() => setIsUploading(false));
  };

  const send = () => {
    if ((!draft.trim() && !attachedFile) || !ch || isUploading) return;
    const text = draft.trim();
    const file = attachedFile;
    setDraft('');
    setAttachedFile(null);
    api.sendCreatorMessage(String(ch.author_id), text || null, 'user', file ? { media_url: file.media_url, media_name: file.media_name, media_type: file.media_type } : undefined, activeChannelType)
      .then(m => {
        const dm = toDealMsg(m);
        setMsgs(prev => [...prev, dm]);
        setChannels(prev => prev.map(c => channelKey(c) === channelKey(ch) ? { ...c, last_message: dm.text, last_message_time: m.created_at } : c));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Не удалось отправить сообщение';
        toast('err', msg);
      });
  };

  const handleStartChat = (targetId: string, channelType?: string) => {
    api.initCommunication(targetId, channelType)
      .then(channel => {
        setChannels(prev => prev.some(c => channelKey(c) === channelKey(channel)) ? prev.map(c => channelKey(c) === channelKey(channel) ? channel : c) : [channel, ...prev]);
        setSelectedAuthorId(String(channel.author_id));
        setNewChatOpen(false);
        setChatTab('active');
      })
      .catch(() => toast('err', 'Не удалось начать диалог'));
  };

  const handleArchiveConfirm = () => {
    if (!ch) return;
    const targetId = String(ch.author_id);
    api.updateCreatorStatus(targetId, 'В архиве', activeDeals.length > 0 ? closeDeals : false)
      .then(() => {
        setChannels(prev => prev.map(c => String(c.author_id) === String(ch.author_id) ? { ...c, is_archived: true } : c));
        setConfirmArchive(false);
        toast('info', 'Чат перемещён в архив');
      })
      .catch(() => toast('err', 'Не удалось архивировать чат'));
  };

  const handleRestoreChat = () => {
    if (!ch) return;
    const targetId = String(ch.author_id);
    api.updateCreatorStatus(targetId, 'Свободен')
      .then(() => {
        setChannels(prev => prev.map(c => String(c.author_id) === String(ch.author_id) ? { ...c, is_archived: false } : c));
        setChatTab('active');
        toast('ok', 'Чат восстановлен из архива');
      })
      .catch(() => toast('err', 'Не удалось восстановить чат'));
  };

  const retryMessages = () => {
    if (!ch) return;
    setMessagesError(null);
    setMessagesLoading(true);
    api.getCreatorMessages(String(ch.author_id), activeChannelType)
      .then(items => { setMsgs(items.map(toDealMsg)); setMessagesLoading(false); })
      .catch(() => { setMessagesLoading(false); setMessagesError('Не удалось загрузить сообщения'); });
  };

  return (
    <div className="h-full flex">
      <aside className="w-[320px] shrink-0 border-r border-line bg-white flex flex-col">
        <div className="px-4 pt-5 pb-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-collab font-semibold text-ink leading-tight truncate">Коммуникации</h1>
            <p className="text-[12px] font-medium text-muted mt-0.5 truncate">Чаты сделок · {activeCount} активных</p>
          </div>
          <Btn size="sm" onClick={() => setNewChatOpen(true)} className="!h-8 !px-2.5 !text-[12px] shrink-0 font-semibold whitespace-nowrap">
            <Plus size={13} className="shrink-0" />Новый чат
          </Btn>
        </div>
        <div className="px-3 pb-2 flex items-center gap-1">
          <button onClick={() => setChatTab('active')}
            className={'flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12.5px] font-semibold transition-colors ' + (chatTab === 'active' ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-slate-50')}>
            Активные ({activeCount})
          </button>
          <button onClick={() => setChatTab('archived')}
            className={'flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12.5px] font-semibold transition-colors ' + (chatTab === 'archived' ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-slate-50')}>
            Архив ({archivedCount})
          </button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input className={inputCls + ' !h-8.5 !pl-8 !text-[12.5px]'} placeholder="Поиск чата…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-2 pb-2 flex flex-col gap-0.5">
          {channelsLoading && <div className="px-2 py-2"><SkeletonLines rows={7} /></div>}
          {!channelsLoading && channelsError && (
            <div className="py-6">
              <ErrorState message={channelsError} onRetry={loadChannels} />
            </div>
          )}
          {!channelsLoading && !channelsError && filtered.map(c => {
            const ca = channelAuthor(c);
            const isSelected = selectedAuthorId === String(c.author_id);
            return (
              <button key={String(c.author_id)} onClick={() => setSelectedAuthorId(String(c.author_id))} aria-current={isSelected}
                className={'flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-colors ' + (isSelected ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                <Avatar nick={ca.nick} hue={ca.hue} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={'text-[13px] font-bold truncate ' + (isSelected ? 'text-brand-700' : 'text-gray-800')}>{ca.nick}</span>
                    <span className="text-[10.5px] font-bold text-gray-400 shrink-0">{formatMessageTime(c.last_message_time)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-gray-500 shrink-0">{formatChannelName(c.channel_type)}</span>
                    <span className="text-[12px] font-medium text-muted truncate">{c.last_message}</span>
                  </span>
                </span>
                {c.unread_count > 0 && <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10.5px] font-extrabold flex items-center justify-center shrink-0">{c.unread_count}</span>}
              </button>
            );
          })}
          {!channelsLoading && !channelsError && filtered.length === 0 && (
            <div className="py-6">
              <Empty title={chatTab === 'active' ? 'Нет активных чатов' : 'Архив пуст'} text={chatTab === 'active' ? 'Начните новый диалог с автором' : 'Архивные чаты появятся здесь'} />
            </div>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col bg-page">
        <div className="px-5 py-3 bg-white border-b border-line flex items-center gap-3 shrink-0">
          <Avatar nick={a?.nick ?? ''} hue={a?.hue ?? 0} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="text-[14px] font-bold text-ink truncate">{a?.nick ?? ''}</span>{a && <SocialIcon social={a.social} size={13} />}</div>
            {Boolean(ch?.deal_title) && <div className="text-[11.5px] font-semibold text-muted truncate">Сделка: {ch?.deal_title}</div>}
            <div className="flex items-center gap-1.5 mt-0.5">
              {ch && <div ref={channelMenuRef} className="relative">
                <button type="button" aria-expanded={channelMenuOpen} onClick={() => setChannelMenuOpen(open => !open)}
                  className={'rounded-lg border px-2.5 py-1 text-[12px] font-semibold flex items-center gap-1.5 transition-colors ' + (channelToneClasses[activeChannelType.toLowerCase()] || 'border-line bg-gray-50 text-gray-700')}>
                  {formatChannelName(activeChannelType)}
                  {activeChannelType.toLowerCase() === 'telegram' && <span className="rounded-md border border-emerald-200/80 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Рекомендуется</span>}
                  <ChevronDown size={13} className={'transition-transform ' + (channelMenuOpen ? 'rotate-180' : '')} />
                </button>
                {channelMenuOpen && (() => {
                  const available = (ch.available_channels ?? []).filter(option => option.channel_type && option.channel_type.toLowerCase() !== 'internal');
                  const options = Array.from(new Map((available.length ? available : [{ channel_type: 'instagram' }]).map(option => [option.channel_type.toLowerCase(), option])).values());
                  return <div className="absolute top-full left-0 mt-1 z-30 min-w-[210px] bg-white rounded-xl shadow-lg border border-line py-1">
                    <div className="text-[10px] uppercase font-bold text-gray-400 px-3 py-1">Способ связи</div>
                    {options.map(option => <button key={option.channel_type} type="button" className="w-full flex items-center justify-between px-3 py-2 text-[12.5px] font-semibold text-left transition-colors hover:bg-slate-50"
                      onClick={() => {
                        setActiveChannelType(option.channel_type);
                        setChannelMenuOpen(false);
                      }}>
                      <span>{formatChannelName(option.channel_type)}</span>
                      <span className="flex items-center gap-2">
                        {option.channel_type.toLowerCase() === 'telegram' && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Рекомендуется</span>}
                        {option.channel_type.toLowerCase() === activeChannelType.toLowerCase() && <Check size={14} className="text-brand-600" />}
                      </span>
                    </button>)}
                  </div>;
                })()}
              </div>}
              {targetDeal ? (
                <Badge tone={STAGE_TONES[targetDeal.stage] ?? 'gray'} dot>{getStage(targetDeal.stage).name}</Badge>
              ) : ch?.is_archived ? (
                <Badge tone="gray">В архиве</Badge>
              ) : (
                <Badge tone="violet">Аутрич / Переговоры</Badge>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {targetDeal ? (
              <>
                <Btn variant="secondary" size="sm" onClick={() => onOpenDeal?.(String(targetDeal.id))}><Briefcase size={13} />Сделка</Btn>
                {!ch?.is_archived ? (
                  <Tip label="В архив"><Btn variant="ghost" size="sm" onClick={() => { setCloseDeals(true); setConfirmArchive(true); }}><Archive size={14} /></Btn></Tip>
                ) : (
                  <Btn variant="secondary" size="sm" onClick={handleRestoreChat}><ArchiveRestore size={13} />Восстановить из архива</Btn>
                )}
              </>
            ) : ch?.is_archived ? (
              <>
                <Tip label="Восстановите автора из архива, чтобы оформить сделку"><Btn size="sm" disabled className="opacity-40 cursor-not-allowed pointer-events-none"><Plus size={13} />Оформить сделку</Btn></Tip>
                <Btn variant="secondary" size="sm" onClick={handleRestoreChat}><ArchiveRestore size={13} />Восстановить из архива</Btn>
              </>
            ) : (
              <>
                <Btn size="sm" onClick={() => ch && onNewDeal?.(String(ch.author_id), { name: ch.author_name, handle: ch.author_handle })}><Plus size={13} />Оформить сделку</Btn>
                <Tip label="В архив"><Btn variant="ghost" size="sm" onClick={() => { setCloseDeals(true); setConfirmArchive(true); }}><Archive size={14} /></Btn></Tip>
              </>
            )}
          </div>
        </div>
        <div ref={chatRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin p-5 flex flex-col gap-3">
          {messagesLoading && msgs.length === 0 && <div className="m-auto flex items-center gap-2 text-[12.5px] font-semibold text-gray-400"><Loader2 size={16} className="animate-spin" />Загрузка сообщений…</div>}
          {messagesError && msgs.length === 0 && <div className="m-auto"><ErrorState message={messagesError} onRetry={retryMessages} /></div>}
          {!messagesLoading && !messagesError && !msgs.some(m => m.from === 'user' || m.from === 'author') && <div className="m-auto text-center text-[13px] font-semibold text-muted">{ch ? `Начните диалог — автор увидит сообщение в ${formatChannelName(activeChannelType)}` : 'Начните диалог'}</div>}
          {msgs.map(m => {
            if (m.from === 'system') {
              return (
                <div key={m.id} className="flex justify-center my-1.5">
                  <span className="text-[11px] font-medium text-gray-400 bg-gray-100/80 border border-gray-200/60 px-3 py-0.5 rounded-full">
                    {m.text} · {m.time}
                  </span>
                </div>
              );
            }
            const isOut = m.from === 'user';
            return (
              <div key={m.id} className={'flex ' + (isOut ? 'justify-end' : 'justify-start')}>
                <div className={'relative max-w-[60%] rounded-2xl px-3.5 py-2.5 text-[13px] font-medium leading-snug shadow-sm ' + (isOut ? 'tail-r bg-brand-500 text-white rounded-br-md' : 'tail-l bg-white border border-line text-gray-800 rounded-bl-md')}>
                  {m.media_url && m.media_type === 'image' && (
                    <ChatImage src={resolveMediaUrl(m.media_url)} alt={m.media_name || undefined} />
                  )}
                  {m.media_url && m.media_type === 'video' && (
                    <VideoPlayer src={resolveMediaUrl(m.media_url)} />
                  )}
                  {m.media_url && m.media_type !== 'image' && m.media_type !== 'video' && (
                    <a href={resolveMediaUrl(m.media_url)} target="_blank" download={m.media_name || 'document'} className="flex items-center gap-2 p-2.5 rounded-xl bg-black/5 hover:bg-black/10 transition-colors mb-1.5">
                      <FileText size={16} className="shrink-0" />
                      <span className="text-[12.5px] font-semibold truncate">{m.media_name || 'Документ'}</span>
                      <Download size={14} className="shrink-0" />
                    </a>
                  )}
                  {m.text && <span className="block">{m.text}</span>}
                  <span className={'block text-[10.5px] font-semibold mt-1 text-right ' + (isOut ? 'text-brand-200' : 'text-gray-400')}>{m.time} {isOut && '✓✓'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3.5 border-t border-line bg-white shrink-0 flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileSelect}
          />
          {attachedFile && (
            <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[12px] font-medium text-brand-700 shrink-0">
              <FileText size={14} className="shrink-0" />
              <span className="max-w-[160px] truncate">{attachedFile.media_name}</span>
              <span className="text-brand-400 shrink-0">{formatFileSize(attachedFile.file_size)}</span>
              <button onClick={() => setAttachedFile(null)} className="text-brand-400 hover:text-brand-700 shrink-0"><X size={13} /></button>
            </div>
          )}
          <button disabled={isUploading} aria-label="Прикрепить файл" className={'w-9 h-9.5 rounded-lg flex items-center justify-center shrink-0 ' + (isUploading ? 'text-brand-500 cursor-default' : 'text-gray-400 hover:bg-gray-100 hover:text-brand-600')} onClick={() => fileInputRef.current?.click()}>
            {isUploading ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
          </button>
          <textarea rows={1} value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={'Сообщение для ' + (a?.nick ?? '') + '…'}
            className="flex-1 resize-none rounded-xl border border-line px-3.5 py-2.5 text-[13px] leading-snug outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100 transition-shadow" />
          <Btn onClick={send} disabled={(!draft.trim() && !attachedFile) || isUploading} className="!rounded-xl !w-9.5 !h-9.5 !p-0 shrink-0"><Send size={15} /></Btn>
        </div>
      </div>
      {newChatOpen && <NewChatModal channels={channels} onClose={() => setNewChatOpen(false)} onStart={handleStartChat} />}
      {confirmArchive && ch && (
        <Modal onClose={() => setConfirmArchive(false)} w="max-w-sm">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="text-[16px] font-collab font-semibold text-ink">Архивировать диалог?</h2>
          </div>
          {activeDeals.length === 0 ? (
            <div className="px-5 py-4 text-[13px] font-medium text-gray-600 leading-relaxed">
              Чат и автор @{a?.nick ?? ''} будут перемещены в архив. Вы сможете восстановить их в любой момент.
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-800 leading-relaxed">
                У автора {activeDeals.length} {activeDeals.length % 10 === 1 && activeDeals.length % 100 !== 11 ? 'открытая сделка' : activeDeals.length % 10 >= 2 && activeDeals.length % 10 <= 4 && (activeDeals.length % 100 < 10 || activeDeals.length % 100 >= 20) ? 'открытые сделки' : 'открытых сделок'} на сумму {fmtMoney(activeBudget)}.
              </div>
              <label className="mt-3 flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={closeDeals} onChange={e => setCloseDeals(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-200" />
                <span className="text-[13px] font-medium text-gray-700">Перевести активные сделки в архив (сорваны)</span>
              </label>
            </div>
          )}
          <div className="px-5 py-4 border-t border-line flex items-center justify-end gap-2">
            <Btn variant="secondary" size="sm" onClick={() => setConfirmArchive(false)}>Отмена</Btn>
            <Btn size="sm" onClick={handleArchiveConfirm}><Archive size={13} />В архив</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewChatModal({ channels, onClose, onStart }: {
  channels: CommunicationChannelItem[];
  onClose: () => void;
  onStart: (authorId: string, channelType?: string) => void;
}) {
  const [creators, setCreators] = useState<CreatorRecord[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getCreators()
      .then(records => { if (!cancelled) { setCreators(records); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return creators;
    return creators.filter(c => (c.name || c.Name || c.handle || c.username || '').toLowerCase().includes(s));
  }, [creators, q]);

  return (
    <Modal onClose={onClose} w="max-w-xl">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="text-[16px] font-collab font-semibold text-ink">Новый чат</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="px-5 py-3 border-b border-line">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input className={inputCls + ' !pl-9'} placeholder="Поиск по нику или имени…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-3 flex flex-col gap-1.5">
        {loading && <div className="px-2 py-2"><SkeletonLines rows={5} /></div>}
        {!loading && list.length === 0 && <Empty title="Авторы не найдены" text="Попробуйте изменить запрос" />}
        {list.map(creator => {
          const id = String(creator.accountid || creator.accountId || creator.id || creator.username || creator.handle || '');
          const contacts = [
            ...(creator.telegram_commercial || creator.telegram_personal ? [{ channel_type: 'telegram', target: creator.telegram_commercial || creator.telegram_personal || '' }] : []),
            ...(creator.email ? [{ channel_type: 'email', target: creator.email }] : []),
            ...(creator.phone ? [{ channel_type: 'whatsapp', target: creator.phone }] : []),
            ...(creator.instagram || creator.username || creator.handle ? [{ channel_type: 'instagram', target: creator.instagram || creator.username || creator.handle || '' }] : []),
          ];
          const nick = creator.name || creator.Name || creator.handle || creator.username || 'Без имени';
          const social = normalizeSocial(creator.platform || creator.Platform || 'Instagram');
          const followers = Number(creator.followers ?? creator.subscribers_count ?? 0);
          const hue = hashHue(id);
          return (
            <div key={id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-brand-200 transition-colors">
              <Avatar nick={nick} hue={hue} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-ink truncate">{nick}</span>
                  <SocialIcon social={social} size={13} />
                </div>
                <div className="text-[11.5px] font-semibold text-muted">{social} · {fmtBig(followers)} подписчиков</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {contacts.map(contact => {
                  const exists = channels.some(channel => String(channel.author_id) === id && channel.channel_type === contact.channel_type);
                  return <button key={contact.channel_type} type="button" onClick={() => onStart(id, contact.channel_type)}
                    className="rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-gray-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
                    {exists ? 'Открыть' : 'В'} {getChannelBadge(contact.channel_type).label.replace('Канал: ', '')}
                  </button>;
                })}
                {contacts.length === 0 && <Badge tone="gray">Нет контактов</Badge>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

const fmtBig = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')}M` : n.toLocaleString('ru-RU');

const hashHue = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
};

const stripAt = (value: string): string => value.startsWith('@') ? value.slice(1) : value;

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '').replace('.', ',')} МБ`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace('.0', '').replace('.', ',')} КБ`;
  return `${bytes} Б`;
};

const formatMessageTime = (isoString: string): string => {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const channelAuthor = (c: CommunicationChannelItem): Pick<Author, 'nick' | 'social' | 'hue'> => {
  return {
    nick: c.author_handle || c.author_name,
    hue: hashHue(String(c.author_id)),
    social: (c.platform === 'instagram' ? 'Instagram' : c.platform === 'telegram' ? 'Telegram' : c.platform === 'youtube' ? 'YouTube' : 'Instagram') as Social,
  };
};

const toDealMsg = (m: DealMessageItem): CommsMessage => ({
  id: String(m.id),
  from: m.sender_type === 'creator' ? 'author' : (m.sender_type === 'system' ? 'system' : 'user'),
  text: m.text || '',
  time: new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  media_url: m.media_url,
  media_name: m.media_name,
  media_type: m.media_type,
});
