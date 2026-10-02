import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  LogIn,
  UserPlus,
  LogOut,
  LayoutDashboard,
  Shield,
  PenLine,
  CalendarDays,
  Search,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import SearchInput from './SearchInput';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative rounded-lg px-3 py-2 text-sm font-bold transition ${
    isActive
      ? 'text-brand-950 after:absolute after:inset-x-3 after:-bottom-1 after:h-0.5 after:bg-gold-500 dark:text-gold-300'
      : 'text-brand-800 hover:bg-brand-100 dark:text-stone-300 dark:hover:bg-brand-900/60'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const navigate = useNavigate();

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('almagles_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('almagles_theme', 'light');
    }
    setIsDark(next);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <header className="site-header sticky top-0 z-40 transition-colors">
      <div className="container-site">
        <div className="flex h-[4.5rem] items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Primary Desktop Links */}
          <div className="flex items-center gap-3 lg:gap-6 min-w-0">
            <Link to="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
              <Logo className="h-9 w-9 sm:h-10 sm:w-10 shrink-0" />
              <div className="leading-tight">
                <span className="font-display text-lg sm:text-xl font-extrabold text-brand-900 dark:text-stone-100 block truncate">
                  رجال الأمة
                </span>
                <span className="hidden sm:block text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  مقرر وفوائد يومية
                </span>
              </div>
            </Link>

            {/* Primary desktop links */}
            <nav className="hidden lg:flex items-center gap-1">
              <NavLink to="/" className={navLinkClass} end>
                الرئيسية
              </NavLink>
              {user && user.role === 'admin' && (
                <NavLink to="/admin" className={navLinkClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="h-4 w-4" />
                    لوحة التحكم
                  </span>
                </NavLink>
              )}
              {user && user.role === 'writer' && (
                <NavLink to="/write" className={navLinkClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <PenLine className="h-4 w-4" />
                    النشر
                  </span>
                </NavLink>
              )}
              {user && user.role !== 'admin' && user.canManageSchedule && (
                <NavLink to="/manage/schedule" className={navLinkClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    الجدول
                  </span>
                </NavLink>
              )}
            </nav>
          </div>

          {/* Action cluster: Search, Theme, Auth, Mobile Menu */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Desktop inline search input */}
            <div className="hidden sm:block w-44 md:w-56 lg:w-64 shrink-0">
              <SearchInput />
            </div>

            {/* Mobile search toggle button */}
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen((v) => !v);
                setOpen(false);
              }}
              className="flex sm:hidden h-9 w-9 items-center justify-center rounded-xl p-2 text-stone-600 hover:bg-brand-100 hover:text-brand-900 dark:text-stone-200 dark:hover:bg-brand-900/60 shrink-0"
              aria-label="البحث"
            >
              {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl p-2 text-stone-600 transition hover:bg-brand-100 hover:text-brand-900 dark:text-stone-300 dark:hover:bg-brand-900/60 dark:hover:text-gold-300 shrink-0"
              aria-label={isDark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
              title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="hidden sm:block h-5 w-px bg-brand-200 dark:bg-brand-800 shrink-0" />

            {/* Desktop Auth */}
            {user ? (
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className="hidden md:inline px-1 text-sm font-bold text-brand-800 dark:text-stone-200">
                  {user.name}
                </span>
                <button onClick={handleLogout} className="btn-outline !px-2.5 !py-1.5 text-xs shrink-0">
                  <LogOut className="h-3.5 w-3.5" />
                  خروج
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <NavLink to="/login" className="btn-outline !px-3 !py-1.5 text-xs shrink-0">
                  <LogIn className="h-3.5 w-3.5" />
                  دخول
                </NavLink>
                <NavLink to="/signup" className="btn-primary !px-3 !py-1.5 text-xs shrink-0">
                  <UserPlus className="h-3.5 w-3.5" />
                  حساب جديد
                </NavLink>
              </div>
            )}

            {/* Mobile menu trigger */}
            <button
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-xl p-2 text-brand-900 hover:bg-brand-100 dark:text-stone-200 dark:hover:bg-brand-900 shrink-0"
              onClick={() => {
                setOpen((v) => !v);
                setMobileSearchOpen(false);
              }}
              aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile expandable search bar directly beneath header */}
      {mobileSearchOpen && (
        <div className="border-t border-brand-200/80 bg-white/95 px-4 py-2.5 shadow-md dark:border-brand-800 dark:bg-[#081711] sm:hidden animate-fade-in">
          <SearchInput autoFocus onSelect={() => setMobileSearchOpen(false)} />
        </div>
      )}

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-950 lg:hidden">
          <nav className="container-site flex flex-col gap-1 py-3">
            <div className="mb-2">
              <SearchInput onSelect={() => setOpen(false)} />
            </div>

            <NavLink to="/" className={navLinkClass} end onClick={() => setOpen(false)}>
              الرئيسية
            </NavLink>
            {user && user.role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass} onClick={() => setOpen(false)}>
                <span className="inline-flex items-center gap-1.5">
                  <LayoutDashboard className="h-4 w-4" />
                  لوحة التحكم
                </span>
              </NavLink>
            )}
            {user && user.role === 'writer' && (
              <NavLink to="/write" className={navLinkClass} onClick={() => setOpen(false)}>
                <span className="inline-flex items-center gap-1.5">
                  <PenLine className="h-4 w-4" />
                  النشر
                </span>
              </NavLink>
            )}
            {user && user.role !== 'admin' && user.canManageSchedule && (
              <NavLink to="/manage/schedule" className={navLinkClass} onClick={() => setOpen(false)}>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  الجدول
                </span>
              </NavLink>
            )}
            <div className="my-2 h-px bg-brand-100 dark:bg-brand-800" />
            {user ? (
              <>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-brand-800 dark:text-stone-200">
                    {user.role === 'admin' && <Shield className="h-4 w-4 text-gold-600" />}
                    {user.name}
                  </span>
                  <button onClick={handleLogout} className="btn-outline !px-2 !py-1 text-xs">
                    <LogOut className="h-3.5 w-3.5" />
                    خروج
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 px-3 py-2">
                <Link to="/login" className="btn-outline" onClick={() => setOpen(false)}>
                  <LogIn className="h-4 w-4" />
                  دخول
                </Link>
                <Link to="/signup" className="btn-primary" onClick={() => setOpen(false)}>
                  <UserPlus className="h-4 w-4" />
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
