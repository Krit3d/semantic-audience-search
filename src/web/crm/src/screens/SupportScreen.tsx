import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LifeBuoy, Send, ChevronDown, RefreshCw } from 'lucide-react';
import { api, type SupportTicketDetail, type SupportTicketItem } from '../services/api';
import { Btn, Field, inputCls, useToast } from '../components/ui';

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'question', label: 'Вопрос' },
  { id: 'bug', label: 'Ошибка в работе' },
  { id: 'suggestion', label: 'Предложение' },
  { id: 'other', label: 'Другое' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: 'Новый', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'В работе', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Решён', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Закрыт', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

function TicketRow({ ticket }: { ticket: SupportTicketItem }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const meta = STATUS_META[ticket.status] ?? STATUS_META.new;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      api.getMyTicket(ticket.id).then(setDetail).catch(() => undefined);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
        <span className="text-[12px] font-mono font-semibold text-faint shrink-0">{ticket.ticket_number}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-ink truncate">{ticket.subject}</span>
          <span className="block text-[11.5px] font-medium text-muted mt-0.5">
            {CATEGORY_LABELS[ticket.category] ?? ticket.category} · {fmtDate(ticket.created_at)}
          </span>
        </span>
        <span className={`px-2 h-5.5 inline-flex items-center rounded-full border text-[11px] font-bold shrink-0 ${meta.cls}`}>{meta.label}</span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-[#f3f4f6] bg-slate-50/50">
          <div className="text-[12.5px] font-medium text-gray-600 leading-relaxed whitespace-pre-wrap">
            {detail ? detail.description : 'Загружаем…'}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportScreen() {
  const toast = useToast();
  const [category, setCategory] = useState('question');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getMyTickets()
      .then(items => { setTickets(items); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast('err', 'Заполните тему и описание');
      return;
    }
    setBusy(true);
    try {
      const ticket = await api.createTicket({ category, subject: subject.trim(), description: description.trim() });
      toast('ok', `Обращение ${ticket.ticket_number} отправлено. Ответим на вашу почту.`);
      setSubject('');
      setDescription('');
      load();
    } catch {
      toast('err', 'Не удалось отправить обращение. Попробуйте позже');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-[860px] mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><LifeBuoy size={20} /></span>
          <div>
            <h1 className="text-[22px] font-extrabold font-display text-gray-900">Поддержка</h1>
            <div className="text-[12.5px] font-semibold text-gray-400">Прямые обращения в команду Collabrama</div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-gray-100 bg-white p-6 flex flex-col gap-4">
          <div className="text-[15px] font-bold text-gray-900">Новое обращение</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Категория">
              <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Тема">
              <input className={inputCls} maxLength={200} placeholder="Коротко о вопросе"
                value={subject} onChange={e => setSubject(e.target.value)} />
            </Field>
          </div>
          <Field label="Описание">
            <textarea className={inputCls + ' !h-auto py-2.5'} rows={5} maxLength={2000}
              placeholder="Опишите ситуацию подробно: что делали, что ожидали, что произошло"
              value={description} onChange={e => setDescription(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11.5px] font-medium text-gray-400">
              Ответ придёт на почту вашего аккаунта. По тарифам и оплате можно также писать на support@collabrama.ru.
            </div>
            <Btn type="submit" disabled={busy}>
              {busy ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Send size={14} />}
              {busy ? 'Отправляем…' : 'Отправить обращение'}
            </Btn>
          </div>
        </form>

        <div className="flex items-center justify-between">
          <div className="text-[15px] font-bold text-gray-900">Мои обращения</div>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-gray-600">
            <RefreshCw size={13} />Обновить
          </button>
        </div>

        {loading && <div className="text-[13px] font-semibold text-gray-400">Загружаем обращения…</div>}
        {!loading && tickets.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-10 text-center text-[13px] font-semibold text-gray-400">
            Обращений пока нет — мы рядом, если что-то понадобится
          </div>
        )}
        {!loading && tickets.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {tickets.map(t => <TicketRow key={t.id} ticket={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}
