import { useState, type FormEvent } from 'react';
import { Zap, Lock, Eye, EyeOff, AlertTriangle, KeyRound, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { Btn, Field, inputCls } from './ui';

export default function ResetPasswordScreen({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов');
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось изменить пароль. Попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };

  const goLogin = () => {
    window.location.hash = '#/authors';
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-gray-900">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-11 h-11 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30"><Zap size={22} /></span>
            <div>
              <div className="text-[19px] font-extrabold font-display text-gray-900 leading-none">Collabrama CRM</div>
              <div className="text-[11px] font-medium text-gray-400 mt-1">CRM для работы с авторами</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
            {done ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-700">
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  Пароль успешно изменён. Теперь вы можете войти с новым паролем.
                </div>
                <Btn onClick={goLogin} className="w-full justify-center">Перейти ко входу</Btn>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <h1 className="text-[17px] font-bold text-gray-900">Новый пароль</h1>
                  <p className="text-[12.5px] font-medium text-gray-400 mt-1">Задайте новый пароль для вашего аккаунта</p>
                </div>

                <Field label="Новый пароль">
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input className={inputCls + ' !pl-9 !pr-9'} type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus
                      placeholder="••••••••" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} />
                    <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                <Field label="Повторите пароль">
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input className={inputCls + ' !pl-9'} type={show ? 'text' : 'password'} autoComplete="new-password"
                      placeholder="••••••••" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} />
                  </div>
                </Field>

                <p className="text-[11px] font-medium text-gray-400">Минимум 8 символов. Ссылка действует 1 час и только один раз.</p>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-600">
                    <AlertTriangle size={15} className="shrink-0" />{error}
                  </div>
                )}

                <Btn type="submit" disabled={busy} className="w-full justify-center">
                  {busy ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <KeyRound size={15} />}
                  {busy ? 'Сохраняем…' : 'Сохранить пароль'}
                </Btn>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
