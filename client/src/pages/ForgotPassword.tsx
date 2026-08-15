import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';

const RESEND_COOLDOWN = 60;

export default function ForgotPassword() {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const sendCode = async (resetCooldown = true) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ message: string; devCode?: string }>('/auth/send-code', {
        method: 'POST',
        body: { email: email.trim(), purpose: 'reset' },
      });
      if (res.devCode) {
        setDevCode(res.devCode);
        setCode(res.devCode);
      }
      if (resetCooldown) setCountdown(RESEND_COOLDOWN);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال الرمز');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sendCode()) {
      setStep('code');
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (code.trim().length !== 6) {
      setError('أدخل رمز التحقق المكوّن من ٦ أرقام');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { email: email.trim(), code: code.trim(), password },
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر استعادة كلمة المرور');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || countdown > 0) return;
    if (await sendCode()) setCountdown(RESEND_COOLDOWN);
  };

  return (
    <div className="container-site flex justify-center py-12">
      <div className="card w-full max-w-md p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-800 text-white">
            {step === 'done' ? <ShieldCheck className="h-6 w-6" /> : step === 'code' ? <MailCheck className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 font-display text-2xl font-black text-brand-950">
            {step === 'done' ? 'تم استعادة كلمة المرور' : 'استعادة كلمة المرور'}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {step === 'email'
              ? 'أدخل بريدك وسنرسل لك رمز تحقق'
              : step === 'code'
                ? `أدخل الرمز وكلمة المرور الجديدة (الرمز أُرسل إلى ${email})`
                : 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة'}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
        )}

        {step === 'email' && (
          <form onSubmit={submitEmail} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                className="input"
                dir="ltr"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال رمز التحقق'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitReset} className="space-y-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
              dir="ltr"
              placeholder="000000"
              className="input !py-4 text-center !text-2xl !tracking-[0.5em] font-mono"
            />
            {devCode && (
              <p className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
                <ShieldCheck className="h-4 w-4" />
                رمز التطوير (لا يظهر في الإنتاج): {devCode}
              </p>
            )}
            <div>
              <label className="label" htmlFor="password">
                كلمة المرور الجديدة
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={72}
                required
              />
              <p className="mt-1 text-xs text-stone-400">٨ أحرف على الأقل</p>
            </div>
            <div>
              <label className="label" htmlFor="confirm">
                تأكيد كلمة المرور
              </label>
              <input
                id="confirm"
                type="password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                maxLength={72}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy || code.trim().length !== 6}>
              {busy ? 'جارٍ الحفظ…' : 'إعادة تعيين كلمة المرور'}
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={busy || countdown > 0}
              className="w-full text-center text-sm font-bold text-brand-700 underline underline-offset-2 disabled:text-stone-400 disabled:no-underline"
            >
              {countdown > 0 ? `إعادة الإرسال بعد ${countdown} ثانية` : 'إعادة إرسال الرمز'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <Link to="/login" className="btn-primary w-full">
            تسجيل الدخول
          </Link>
        )}

        {step !== 'done' && (
          <p className="mt-5 text-center text-sm text-stone-500">
            تذكرت كلمة المرور؟{' '}
            <Link to="/login" className="font-extrabold text-brand-700 underline underline-offset-2">
              سجّل الدخول
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}