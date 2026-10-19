import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, Check, KeyRound, Loader as LoaderIcon, Trash2, UserRound, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Post, PublicProfile, User } from '../lib/types';
import Avatar from '../components/Avatar';
import AvatarCropper from '../components/AvatarCropper';
import PostCard from '../components/PostCard';
import Spinner from '../components/Spinner';
import RichText from '../components/RichText';

const ROLE_LABEL: Record<string, string> = { admin: 'مشرف', writer: 'كاتب', visitor: 'عضو' };
const joined = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' });

function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} — رجال الأمة`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** /u/:id — a member's public page: photo, name, role, bio and their posts. */
export function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  useDocumentTitle(profile?.name ?? null);

  useEffect(() => {
    let active = true;
    setState('loading');
    (async () => {
      try {
        const res = await api<{ profile: PublicProfile }>(`/profile/${id}`);
        if (!active) return;
        setProfile(res.profile);
        if (res.profile.postsCount > 0) {
          const list = await api<{ items: Post[] }>(`/posts?author=${encodeURIComponent(id!)}&limit=20`);
          if (active) setPosts(list.items);
        } else setPosts([]);
        if (active) setState('ready');
      } catch (err) {
        if (active) setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'error');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (state === 'loading') return <Spinner full />;
  if (state !== 'ready' || !profile) {
    return (
      <div className="container-site py-16 text-center">
        <p className="font-display text-xl">{state === 'missing' ? 'هذا الحساب غير موجود' : 'تعذّر تحميل الصفحة'}</p>
        <Link to="/" className="mt-4 inline-block text-accent">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  const mine = user?.id === profile.id;
  return (
    <div className="container-site py-8 sm:py-12">
      <div className="mx-auto max-w-[720px]">
        <header className="flex flex-col items-center text-center">
          <Avatar name={profile.name} src={profile.avatarUrl} size="xl" />
          <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight">{profile.name}</h1>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted">
            {profile.role !== 'visitor' && <span className="rounded-full bg-accent-soft px-2.5 text-accent">{ROLE_LABEL[profile.role]}</span>}
            <span>عضو منذ {joined.format(new Date(profile.createdAt))}</span>
          </p>
          {profile.bio && (
            <p className="mt-4 max-w-prose whitespace-pre-line text-[16px] leading-[1.9] text-fg-2 [overflow-wrap:anywhere]">
              <RichText text={profile.bio} ugc />
            </p>
          )}
          <dl className="mt-5 flex gap-8 text-center">
            <div>
              <dt className="text-xs text-muted">المنشورات</dt>
              <dd className="font-display text-xl">{profile.postsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">التعليقات</dt>
              <dd className="font-display text-xl">{profile.commentsCount}</dd>
            </div>
          </dl>
          {mine && (
            <Link to="/profile" className="btn-outline mt-5 !min-h-10 !text-sm">
              تعديل الملف الشخصي
            </Link>
          )}
        </header>

        {posts.length > 0 && (
          <section className="mt-10 space-y-4" aria-label="منشوراته">
            <h2 className="section-heading font-display text-xl">المنشورات</h2>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onChange={(next) => setPosts((list) => list.map((x) => (x.id === next.id ? next : x)))} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

/** /profile — edit your own photo, name, bio and password. */
export function ProfileSettingsPage() {
  const { user, setCurrentUser } = useAuth();
  useDocumentTitle('الملف الشخصي');
  if (!user) return null;
  return (
    <div className="container-site py-8 sm:py-12">
      <div className="mx-auto max-w-[560px] space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[28px] font-semibold">الملف الشخصي</h1>
          <Link to={`/u/${user.id}`} className="inline-flex items-center gap-1.5 font-display text-sm text-accent">
            <UserRound className="h-4 w-4" />
            عرض صفحتي
          </Link>
        </div>
        <PhotoSection user={user} onUser={setCurrentUser} />
        <DetailsSection user={user} onUser={setCurrentUser} />
        <PasswordSection />
      </div>
    </div>
  );
}

const card = 'rounded-2xl border border-line bg-surface p-4 sm:p-6';

function PhotoSection({ user, onUser }: { user: User; onUser: (u: User) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('avatar', new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg', { type: blob.type }));
      const res = await api<{ user: User }>('/profile/avatar', { method: 'POST', body: form });
      onUser(res.user);
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر رفع الصورة — حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('إزالة صورتك الشخصية؟')) return;
    setBusy(true);
    try {
      const res = await api<{ user: User }>('/profile/avatar', { method: 'DELETE' });
      onUser(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف الصورة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={card} aria-labelledby="photo-heading">
      <h2 id="photo-heading" className="font-display text-lg">
        الصورة الشخصية
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <button type="button" onClick={() => input.current?.click()} className="group relative shrink-0 rounded-full" aria-label="تغيير الصورة الشخصية">
          <Avatar name={user.name} src={user.avatarUrl} size="lg" />
          <span className="absolute bottom-0 left-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent-fill text-on-accent">
            <Camera className="h-4 w-4" />
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} className="btn-outline !min-h-10 !px-4 !text-sm" disabled={busy}>
            {user.avatarUrl ? 'تغيير الصورة' : 'إضافة صورة'}
          </button>
          {user.avatarUrl && (
            <button type="button" onClick={remove} className="btn-outline !min-h-10 !px-4 !text-sm !text-danger" disabled={busy}>
              <Trash2 className="h-4 w-4" />
              إزالة
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.type && !f.type.startsWith('image/')) return setError('هذا الملف ليس صورة');
          if (f.size > 40 * 1024 * 1024) return setError('الصورة كبيرة جداً');
          setError(null);
          setFile(f);
        }}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {file && <AvatarCropper file={file} busy={busy} onCancel={() => setFile(null)} onDone={upload} />}
    </section>
  );
}

function DetailsSection({ user, onUser }: { user: User; onUser: (u: User) => void }) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== user.name || bio.trim() !== (user.bio ?? '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: User }>('/profile', { method: 'PATCH', body: { name: name.trim(), bio } });
      onUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className={`${card} space-y-4`} aria-labelledby="details-heading">
      <h2 id="details-heading" className="font-display text-lg">
        البيانات
      </h2>
      <div>
        <label htmlFor="profile-name" className="label">
          الاسم الظاهر
        </label>
        <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={40} required autoComplete="name" />
      </div>
      <div>
        <div className="mb-1.5 flex justify-between">
          <label htmlFor="profile-bio" className="label !mb-0">
            نبذة عنك
          </label>
          <span className="text-[11px] text-muted">{bio.length}/300</span>
        </div>
        <textarea
          id="profile-bio"
          className="input min-h-24 resize-y leading-[1.9]"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={300}
          placeholder="سطران عنك يظهران في صفحتك (اختياري)"
        />
      </div>
      <div>
        <p className="label">البريد الإلكتروني</p>
        <p className="text-sm text-muted" dir="ltr">
          {user.email}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy || !dirty || name.trim().length < 2}>
        {busy ? <LoaderIcon className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {saved ? 'تم الحفظ' : 'حفظ'}
      </button>
    </form>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('/profile/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setMessage({ ok: true, text: 'تم تغيير كلمة المرور، وسُجّل خروجك من الأجهزة الأخرى' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'تعذّر تغيير كلمة المرور' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-4`} aria-labelledby="password-heading">
      <h2 id="password-heading" className="flex items-center gap-2 font-display text-lg">
        <KeyRound className="h-5 w-5 text-accent" />
        كلمة المرور
      </h2>
      <div>
        <label htmlFor="pw-current" className="label">
          كلمة المرور الحالية
        </label>
        <input id="pw-current" type={show ? 'text' : 'password'} className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div>
        <label htmlFor="pw-new" className="label">
          كلمة المرور الجديدة
        </label>
        <div className="relative">
          <input id="pw-new" type={show ? 'text' : 'password'} className="input !pl-12" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72} required />
          <button type="button" onClick={() => setShow(!show)} className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted" aria-label={show ? 'إخفاء كلمات المرور' : 'إظهار كلمات المرور'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">٨ أحرف على الأقل</p>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
      <button type="submit" className="btn-outline" disabled={busy || !current || next.length < 8}>
        {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
        تغيير كلمة المرور
      </button>
    </form>
  );
}
