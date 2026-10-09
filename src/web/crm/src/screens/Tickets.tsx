import { useCallback, useEffect, useMemo, useState } from 'react';
import { LifeBuoy, RefreshCw, X, ChevronLeft, ChevronRight, ExternalLink, Trash2 } from 'lucide-react';
import { api, type SupportTicketDetail, type SupportTicketItem } from '../services/api';
import { useToast, Modal } from '../components/ui';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: 'Новый', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'В работе', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Решён', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Закрыт', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Ошибка / баг',
  question: 'Вопрос',
  suggestion: 'Предложение',
  other: 'Другое',
};

const PAGE_SIZE = 20;

const selectCls = 'h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[12.5px] font-semibold text-gray-700 outline-none focus:border-indigo-300 transition-colors';

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>;
}

export default function Tickets() {
  const toast = useToast();
  const [items, setItems] = useState<SupportTicketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleCheck = (id: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allPageChecked = items.length > 0 && items.every(t => checked.has(t.id));

  const toggleCheckAll = () => {
    setChecked(prev => {
      if (items.length > 0 && items.every(t => prev.has(t.id))) return new Set<number>();
      return new Set(items.map(t => t.id));
    });
  };

  const runBulk = (action: 'delete' | 'set_status', nextStatus?: string) => {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    if (action === 'delete' && !window.confirm(`Удалить выбранные тикеты (${ids.length} шт.) безвозвратно?`)) return;
    setBulkBusy(true);
    api.bulkTickets(ids, action, nextStatus)
      .then(affected => {
        setChecked(new Set());
        load();
        toast('ok', action === 'delete' ? `Удалено тикетов: ${affected}` : `Статус изменён у ${affected} тикетов`);
      })
      .catch(() => toast('err', 'Не удалось выполнить массовое действие'))
      .finally(() => setBulkBusy(false));
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const load = useCallback(() => {
    setLoading(true);
    api.getTickets({ status: status || undefined, category: category || undefined, page, pageSize: PAGE_SIZE })
      .then(res => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => toast('err', 'Не удалось загрузить тикеты'))
      .finally(() => setLoading(false));
  }, [status, category, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setChecked(new Set()); }, [status, category, page]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api.getTicket(selectedId)
      .then(setDetail)
      .catch(() => {
        toast('err', 'Не удалось загрузить тикет');
        setSelectedId(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const changeStatus = (ticketId: number, nextStatus: string) => {
    setUpdatingStatus(true);
    api.updateTicketStatus(ticketId, nextStatus)
      .then(updated => {
        setItems(prev => prev.map(t => (t.id === updated.id ? { ...t, status: updated.status, updated_at: updated.updated_at } : t)));
        setDetail(prev => (prev && prev.id === updated.id ? { ...prev, status: updated.status, updated_at: updated.updated_at } : prev));
        toast('ok', 'Статус обновлён');
      })
      .catch(() => toast('err', 'Не удалось обновить статус'))
      .finally(() => setUpdatingStatus(false));
  };

  const removeTicket = (ticketId: number) => {
    if (!window.confirm('Удалить тикет безвозвратно?')) return;
    setDeleting(true);
    api.deleteTicket(ticketId)
      .then(() => {
        setItems(prev => prev.filter(t => t.id !== ticketId));
        setTotal(prev => Math.max(0, prev - 1));
        setSelectedId(null);
        toast('ok', 'Тикет удалён');
      })
      .catch(() => toast('err', 'Не удалось удалить тикет'))
      .finally(() => setDeleting(false));
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin p-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30"><LifeBuoy size={19} /></span>
          <div>
            <h1 className="text-[18px] font-extrabold font-display text-gray-900 leading-none">Тикеты поддержки</h1>
            <div className="text-[11.5px] font-semibold text-gray-400 mt-1">Всего обращений: {total}</div>
          </div>
          <button onClick={load} disabled={loading}
            className="ml-auto flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-200 bg-white text-[12.5px] font-bold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Обновить
          </button>
        </div>

        <div className="flex items-center gap-2.5 mb-4">
          <select className={selectCls} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Все статусы</option>
            {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <select className={selectCls} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
            <option value="">Все категории</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {checked.size > 0 && (
          <div className="flex items-center gap-2.5 mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-2.5">
            <span className="text-[12.5px] font-bold text-indigo-700">Выбрано: {checked.size}</span>
            <button onClick={() => runBulk('set_status', 'closed')} disabled={bulkBusy}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-[12px] font-bold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50">
              Закрыть выбранные
            </button>
            <button onClick={() => runBulk('set_status', 'resolved')} disabled={bulkBusy}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-[12px] font-bold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50">
              Отметить решёнными
            </button>
            <button onClick={() => runBulk('delete')} disabled={bulkBusy}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 bg-white text-[12px] font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
              <Trash2 size={13} />Удалить выбранные
            </button>
            <button onClick={() => setChecked(new Set())} disabled={bulkBusy}
              className="ml-auto text-[12px] font-bold text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
              Снять выбор
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-slate-50/60">
                <th className="pl-4 pr-1 py-2.5 w-[36px]">
                  <input type="checkbox" checked={allPageChecked} onChange={toggleCheckAll}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer align-middle" aria-label="Выбрать все на странице" />
                </th>
                <th className="px-4 py-2.5 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">Номер</th>
                <th className="px-4 py-2.5 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">Дата</th>
                <th className="px-4 py-2.5 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">Категория</th>
                <th className="px-4 py-2.5 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">Тема</th>
                <th className="px-4 py-2.5 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">Email</th>
                <th className="px-4 py-2.5 text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide">Статус</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[13px] font-semibold text-gray-400">Тикетов нет</td></tr>
              )}
              {items.map(t => (
                <tr key={t.id} onClick={() => setSelectedId(t.id)} className={`border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer transition-colors ${checked.has(t.id) ? 'bg-indigo-50/60' : ''}`}>
                  <td className="pl-4 pr-1 py-3 w-[36px]">
                    <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggleCheck(t.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer align-middle" aria-label={`Выбрать тикет ${t.ticket_number}`} />
                  </td>
                  <td className="px-4 py-3 text-[12px] font-bold font-mono text-indigo-600">{t.ticket_number}</td>
                  <td className="px-4 py-3 text-[12px] font-semibold text-gray-500 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                  <td className="px-4 py-3 text-[12px] font-semibold text-gray-700">{CATEGORY_LABELS[t.category] ?? t.category}</td>
                  <td className="px-4 py-3 text-[12.5px] font-semibold text-gray-900 max-w-[260px] truncate">{t.subject}</td>
                  <td className="px-4 py-3 text-[12px] font-semibold text-gray-500 max-w-[200px] truncate">{t.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="px-4 py-8 text-center text-[12.5px] font-semibold text-gray-400">Загрузка…</div>}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 flex items-center justify-center hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12px] font-bold text-gray-500 tabular-nums">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 flex items-center justify-center hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40">
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {selectedId !== null && (
        <Modal onClose={() => setSelectedId(null)} w="max-w-[560px]">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <h2 className="text-[15.5px] font-bold text-gray-900">Тикет {detail?.ticket_number ?? ''}</h2>
            {detail && <StatusBadge status={detail.status} />}
            <button onClick={() => setSelectedId(null)} className="ml-auto text-gray-300 hover:text-gray-600"><X size={18} /></button>
          </div>
          {detailLoading || !detail ? (
            <div className="p-8 text-center text-[12.5px] font-semibold text-gray-400">Загрузка…</div>
          ) : (
            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Категория</div>
                  <div className="text-[13px] font-bold text-gray-900">{CATEGORY_LABELS[detail.category] ?? detail.category}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Создан</div>
                  <div className="text-[13px] font-bold text-gray-900">{fmtDate(detail.created_at)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Email</div>
                  <div className="text-[13px] font-bold text-gray-900 break-all">{detail.email}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Пользователь</div>
                  <div className="text-[13px] font-bold text-gray-900">{detail.user_id !== null ? `ID ${detail.user_id}` : 'Аноним'}</div>
                </div>
              </div>
              <div>
                <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Тема</div>
                <div className="text-[13.5px] font-bold text-gray-900">{detail.subject}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Описание</div>
                <div className="text-[12.5px] font-medium text-gray-700 whitespace-pre-wrap bg-slate-50 rounded-xl border border-gray-100 px-3.5 py-3 max-h-[220px] overflow-y-auto scroll-thin">{detail.description}</div>
              </div>
              {detail.page_url && (
                <div>
                  <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">Страница</div>
                  <a href={detail.page_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-indigo-600 hover:text-indigo-700 break-all">
                    <ExternalLink size={13} className="shrink-0" />{detail.page_url}
                  </a>
                </div>
              )}
              {detail.user_agent && (
                <div>
                  <div className="text-[10.5px] font-extrabold text-gray-400 uppercase tracking-wide mb-1">User-Agent</div>
                  <div className="text-[11px] font-mono text-gray-500 break-all">{detail.user_agent}</div>
                </div>
              )}
            </div>
          )}
          {detail && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2.5 bg-slate-50/50">
              <span className="text-[11.5px] font-extrabold text-gray-400 uppercase tracking-wide">Статус</span>
              <select className={selectCls} value={detail.status} disabled={updatingStatus}
                onChange={e => changeStatus(detail.id, e.target.value)}>
                {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
              <button onClick={() => removeTicket(detail.id)} disabled={deleting}
                className="ml-auto flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-red-200 bg-white text-[12.5px] font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 size={14} />{deleting ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
