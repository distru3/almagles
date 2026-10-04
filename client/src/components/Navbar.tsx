import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Shield, PenLine, CalendarDays, Search, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import SearchInput from './SearchInput';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 py-2 font-display text-[16px] transition ${
    isActive ? 'text-accent' : 'text-fg-2 hover:text-fg'
  }`;

const iconButton =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition hover:bg-surface-2 hover:text-fg';

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1513' : '#f5efe3');
  try {
    localStorage.setItem('almagles_theme', dark ? 'dark' : 'light');
  } catch {
    /* private mode: the choice just won't persist */
  }
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const navigate = useNavigate();

  const toggleTheme = () => {
    setTheme(!isDark);
    setIsDark(!isDark);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  const roleLinks = (onClick?: () => void) => (
    <>
      {user?.role === 'admin' && (
        <NavLink to="/admin" className={navLinkClass} onClick={onClick}>
          <Shield className="h-4 w-4" />
          لوحة التحكم
        </NavLink>
      )}
      {user?.role === 'writer' && (
        <NavLink to="/write" className={navLinkClass} onClick={onClick}>
          <PenLine className="h-4 w-4" />
          النشر
        </NavLink>
      )}
      {user && user.role !== 'admin' && user.canManageSchedule && (
        <NavLink to="/manage/schedule" className={navLinkClass} onClick={onClick}>
          <CalendarDays className="h-4 w-4" />
          إدارة الجدول
        </NavLink>
      )}
    </>
  );

  return (
    <header className="site-header sticky top-0 z-40">
      <div className="container-site flex h-[4.5rem] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-fg" onClick={() => setOpen(false)}>
            <Logo className="h-7 w-7 text-accent" />
            <span className="font-display text-[22px] font-bold sm:text-[26px]">رجال الأمة</span>
          </Link>
          <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-6 lg:flex">
            <NavLink to="/" className={navLinkClass} end>
              الرئيسية
            </NavLink>
            <a href="/#schedule" className="font-display text-[16px] text-fg-2 transition hover:text-fg">
              الجدول
            </a>
            {roleLinks()}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden w-52 sm:block lg:w-60">
            <SearchInput />
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              setOpen(false);
            }}
            className={`${iconButton} sm:hidden`}
            aria-label={mobileSearchOpen ? 'إغلاق البحث' : 'البحث'}
            aria-expanded={mobileSearchOpen}
          >
            {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className={`${iconButton} border border-line-strong`}
            aria-label={isDark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
            title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="hidden px-1 font-display text-sm text-fg-2 md:inline">{user.name}</span>
              <button onClick={handleLogout} className="btn-outline !min-h-10 !px-4 !text-sm">
                <LogOut className="h-4 w-4" />
                خروج
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="btn-outline !min-h-10 !border-accent !px-4 !text-sm !text-accent">
                تسجيل الدخول
              </Link>
              <Link to="/signup" className="btn-primary !min-h-10 !px-4 !text-sm">
                حساب جديد
              </Link>
            </div>
          )}

          <button
            className={`${iconButton} lg:hidden`}
            onClick={() => {
              setOpen((v) => !v);
              setMobileSearchOpen(false);
            }}
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="border-t border-line bg-canvas px-4 py-2.5 sm:hidden">
          <SearchInput autoFocus onSelect={() => setMobileSearchOpen(false)} />
        </div>
      )}

      {open && (
        <div className="border-t border-line bg-canvas lg:hidden">
          <nav aria-label="القائمة" className="container-site flex flex-col gap-1 py-3">
            <NavLink to="/" className={navLinkClass} end onClick={() => setOpen(false)}>
              الرئيسية
            </NavLink>
            <a href="/#schedule" className="py-2 font-display text-[16px] text-fg-2" onClick={() => setOpen(false)}>
              الجدول
            </a>
            {roleLinks(() => setOpen(false))}
            <div className="my-2 h-px bg-line" />
            {user ? (
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-1.5 font-display text-fg-2">
                  {user.role === 'admin' && <Shield className="h-4 w-4 text-accent" />}
                  {user.name}
                </span>
                <button onClick={handleLogout} className="btn-outline !min-h-10 !px-4 !text-sm">
                  <LogOut className="h-4 w-4" />
                  خروج
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 py-2">
                <Link to="/login" className="btn-outline" onClick={() => setOpen(false)}>
                  تسجيل الدخول
                </Link>
                <Link to="/signup" className="btn-primary" onClick={() => setOpen(false)}>
                  حساب جديد
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
