import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="container-site flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-muted">
        <span className="flex items-center gap-2 font-display text-lg text-fg">
          <Logo className="h-5 w-5 text-accent" />
          رجال الأمة
        </span>
        <nav aria-label="روابط سريعة" className="flex gap-5 font-display">
          <a href="/#postList" className="text-fg-2 hover:text-accent">منشورات اليوم</a>
          <a href="/#schedule" className="text-fg-2 hover:text-accent">المقرر الأسبوعي</a>
        </nav>
        <span>© {new Date().getFullYear()} رجال الأمة — جميع الحقوق محفوظة</span>
      </div>
    </footer>
  );
}
