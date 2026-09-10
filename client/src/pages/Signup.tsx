import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';

const RESEND_COOLDOWN = 60;

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'details' | 'code'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const sendCode = async (withCooldown = true) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ message: string; devCode?: string }>('/auth/send-code', {
        method: 'POST',
        body: { email: email.trim(), purpose: 'signup' },
      });
      if (res.devCode) {
        setDevCode(res.devCode);
        setCode(res.devCode);
      }
      if (withCooldown) setCountdown(RESEND_COOLDOWN);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال الرمز');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    const ok = await sendCode(false);
    if (ok) {
      setCountdown(RESEND_COOLDOWN);
      setStep('code');
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setError('أدخل رمز التحقق المكوّن من ٦ أرقام');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signup(name.trim(), email.trim(), password, code.trim());
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إنشاء الحساب');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || countdown > 0) return;
    if (await sendCode(false)) setCountdown(RESEND_COOLDOWN);
  };

  return (
    <div className="container-site flex justify-center py-12">
      <div className="card card-editorial w-full max-w-md p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-800 text-white">
            {step === 'details' ? <UserPlus className="h-6 w-6" /> : <MailCheck className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 font-display text-2xl font-black text-brand-950">
            {step === 'details' ? 'إنشاء حساب جديد' : 'تحقق من بريدك'}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {step === 'details'
              ? 'انضم لتتفاعل مع المنشورات وتشارك بتعليقاتك'
              : `أدخل الرمز المكوّن من ٦ أرقام المرسل إلى ${email}`}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
        )}

        {step === 'details' ? (
          <form onSubmit={submitDetails} className="space-y-4">
            <div>
              <label className="label" htmlFor="name">
                الاسم
              </label>
              <input
                id="name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={40}
                required
              />
            </div>
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
            <div>
              <label className="label" htmlFor="password">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input pl-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-brand-700"
                  aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال رمز التحقق'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-4">
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
            <button type="submit" className="btn-primary w-full" disabled={busy || code.trim().length !== 6}>
              {busy ? 'جارٍ الإنشاء…' : 'تأكيد وإنشاء الحساب'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={resend}
                disabled={busy || countdown > 0}
                className="font-bold text-brand-700 underline underline-offset-2 disabled:text-stone-400 disabled:no-underline"
              >
                {countdown > 0 ? `إعادة الإرسال بعد ${countdown} ثانية` : 'إعادة إرسال الرمز'}
              </button>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="text-stone-500 hover:text-brand-700"
              >
                تعديل البيانات
              </button>
            </div>
          </form>
        )}

        {step === 'details' && (
          <p className="mt-5 text-center text-sm text-stone-500">
            لديك حساب بالفعل؟{' '}
            <Link to="/login" className="font-extrabold text-brand-700 underline underline-offset-2">
              سجّل الدخول
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
