import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Send, Sparkles, X } from 'lucide-react';
import { Btn, Modal, useToast } from '../../components/ui';
import {
  api,
  ApiError,
  type AutoOutreachPreview,
  type AutoOutreachRunResult,
  type BrandItem,
} from '../../services/api';

type Step = 'brand' | 'confirm' | 'result';

export default function AutoOutreachModal({ brands, onClose, onFinished }: {
  brands: BrandItem[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('brand');
  const [brandId, setBrandId] = useState<number | null>(null);
  const [preview, setPreview] = useState<AutoOutreachPreview | null>(null);
  const [result, setResult] = useState<AutoOutreachRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (!submitting) onClose();
  };

  const selectBrand = async (id: number) => {
    if (loading || submitting) return;
    setBrandId(id);
    setPreview(null);
    setError('');
    setLoading(true);
    try {
      setPreview(await api.previewAutoOutreach(id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось подготовить предпросмотр рассылки');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!brandId || !preview || submitting || !preview.eligible_count || !preview.accounts.length) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await api.runAutoOutreach(brandId);
      setResult(response);
      setStep('result');
      onFinished();
      if (response.queued_count > 0) toast('ok', `В очередь добавлено сообщений: ${response.queued_count}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось запустить автоматическую рассылку');
    } finally {
      setSubmitting(false);
    }
  };

  const accounts = preview?.accounts ?? [];
  const selectedBrand = brands.find(item => item.id === brandId);

  return (
    <Modal onClose={close} w="max-w-xl">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
          <Sparkles size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold text-gray-900">Автоматический аутрич</h3>
          <p className="text-[12.5px] font-medium text-gray-500 mt-1">
            {step === 'brand' && 'Выберите бренд, от лица которого DeepSeek подготовит приветственные сообщения.'}
            {step === 'confirm' && 'Проверьте параметры перед постановкой сообщений в очередь.'}
            {step === 'result' && 'Рассылка обработана.'}
          </p>
        </div>
        <button type="button" onClick={close} disabled={submitting} aria-label="Закрыть"
          className="ml-auto w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex items-center justify-center disabled:opacity-40">
          <X size={17} />
        </button>
      </div>

      <div className="px-5 py-4 overflow-y-auto">
        {step === 'brand' && (
          <>
            <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mb-2">Бренд</div>
            {brands.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-[13px] font-medium text-gray-500">
                Сначала создайте бренд в настройках.
              </div>
            ) : (
              <div className="grid gap-2 max-h-[220px] overflow-y-auto pr-1">
                {brands.map(brand => (
                  <button key={brand.id} type="button" onClick={() => { void selectBrand(brand.id); }}
                    aria-pressed={brandId === brand.id} disabled={loading}
                    className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${brandId === brand.id ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'}`}>
                    <span className="block text-[13.5px] font-bold text-gray-900">{brand.name}</span>
                    <span className="block text-[12px] font-medium text-gray-500 mt-0.5">{brand.category}</span>
                  </button>
                ))}
              </div>
            )}

            {loading && <div className="mt-4 text-[13px] font-semibold text-gray-500">Проверяем авторов и пул аккаунтов…</div>}

            {preview && !loading && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-bold text-gray-800">Авторы на этапе «Первичный контакт»</span>
                  <span className="text-[18px] font-extrabold text-indigo-600 tabular-nums">{preview.eligible_count}</span>
                </div>
                <div className="text-[11.5px] font-medium text-gray-500 mt-1">
                  Новых сообщений: {preview.eligible_count}
                  {preview.already_contacted_count > 0 && ` · уже с исходящими: ${preview.already_contacted_count}`}
                  {preview.unsupported_count > 0 && ` · без доступного Instagram: ${preview.unsupported_count}`}
                </div>
                <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mt-4 mb-2">
                  Аккаунты в порядке ротации
                </div>
                {accounts.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.map((account, index) => (
                      <span key={account.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[12px] font-bold text-emerald-700">
                        <span className="text-emerald-400">{index + 1}.</span>@{account.login}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12.5px] font-semibold text-red-600">Нет рабочих Instagram-аккаунтов в ротации.</div>
                )}
                {accounts.length === 1 && preview.eligible_count > 1 && (
                  <p className="text-[11.5px] font-medium text-amber-700 mt-2">В пуле один аккаунт: все новые авторы получат сообщения с него.</p>
                )}
              </div>
            )}
          </>
        )}

        {step === 'confirm' && preview && (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 flex items-start gap-3">
              <AlertTriangle size={19} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[14px] font-bold text-amber-900">Вы уверены, что хотите разослать приветственные сообщения?</h4>
                <p className="text-[12.5px] font-medium leading-relaxed text-amber-800 mt-1">
                  Для {preview.eligible_count} авторов будут созданы уникальные сообщения от бренда «{preview.brand_name}» и поставлены в очередь отправки. После запуска остановить эту операцию из интерфейса нельзя.
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                <dt className="text-[11px] font-bold text-gray-400 uppercase">Бренд</dt>
                <dd className="text-[13.5px] font-bold text-gray-900 mt-1">{selectedBrand?.name ?? preview.brand_name}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                <dt className="text-[11px] font-bold text-gray-400 uppercase">Получатели</dt>
                <dd className="text-[13.5px] font-bold text-gray-900 mt-1">{preview.eligible_count}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mb-2">Будут использованы аккаунты</div>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {accounts.map((account, index) => (
                  <div key={account.id} className="px-3.5 py-2.5 flex items-center gap-2 text-[13px] font-semibold text-gray-700">
                    <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center text-[11px] font-bold">{index + 1}</span>
                    @{account.login}
                    <span className="ml-auto text-[11px] font-bold text-emerald-600">готов</span>
                  </div>
                ))}
              </div>
              <p className="text-[11.5px] font-medium text-gray-500 leading-relaxed mt-2">
                Для каждого нового автора аккаунты применяются по очереди. Внутри уже существующего канала сохраняется закреплённый аккаунт.
              </p>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 flex items-start gap-3">
              <CheckCircle2 size={21} className="text-emerald-600 shrink-0" />
              <div>
                <h4 className="text-[14px] font-bold text-emerald-900">Обработка завершена</h4>
                <p className="text-[12.5px] font-medium text-emerald-800 mt-1">
                  В очередь: {result.queued_count} · пропущено: {result.skipped_count} · с ошибкой: {result.failed_count}
                </p>
              </div>
            </div>
            {result.results.filter(item => item.status !== 'queued').length > 0 && (
              <div className="mt-4 rounded-xl border border-gray-200 max-h-[220px] overflow-y-auto divide-y divide-gray-100">
                {result.results.filter(item => item.status !== 'queued').map(item => (
                  <div key={item.deal_id} className="px-3.5 py-2.5">
                    <div className="text-[12.5px] font-bold text-gray-800">{item.author_handle}</div>
                    <div className="text-[11.5px] font-medium text-gray-500 mt-0.5">{item.error ?? item.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] font-semibold text-red-700">{error}</div>}
      </div>

      <div className="flex justify-between items-center gap-2 px-5 py-3 border-t border-gray-100">
        {step === 'confirm' ? (
          <Btn variant="ghost" disabled={submitting} onClick={() => { setStep('brand'); setError(''); }}><ArrowLeft size={14} />Назад</Btn>
        ) : <span />}
        <div className="flex gap-2">
          <Btn variant="secondary" disabled={submitting} onClick={close}>{step === 'result' ? 'Закрыть' : 'Отмена'}</Btn>
          {step === 'brand' && (
            <Btn disabled={!preview || loading || !preview.eligible_count || !accounts.length} onClick={() => { setStep('confirm'); setError(''); }}>
              Продолжить
            </Btn>
          )}
          {step === 'confirm' && (
            <Btn disabled={submitting} onClick={() => { void submit(); }}>
              <Send size={14} />{submitting ? 'Подготавливаем…' : 'Подтвердить и отправить'}
            </Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
