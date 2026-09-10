export default function Footer() {
  return (
    <footer className="mt-16 border-t border-brand-800 bg-brand-950 py-10 text-brand-100">
      <div className="container-site grid gap-8 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <p className="font-display text-xl font-black">رجال الأمة</p>
          <p className="mt-2 max-w-xs text-sm leading-7 text-brand-200/80">جدول المقرر الأسبوعي والمنشورات اليومية في مساحة واحدة للقراءة والتفاعل.</p>
        </div>
        <div>
          <p className="text-sm font-extrabold text-gold-200">الوصول السريع</p>
          <div className="mt-3 grid gap-2 text-sm text-brand-200/80">
            <a href="/#postList" className="hover:text-white">منشورات اليوم</a>
            <a href="/#schedule" className="hover:text-white">المقرر الأسبوعي</a>
          </div>
        </div>
        <div className="sm:text-left">
          <p className="text-sm font-extrabold text-gold-200">رجال الأمة</p>
          <p className="mt-3 text-xs text-brand-300/70">© {new Date().getFullYear()} — جميع الحقوق محفوظة</p>
        </div>
      </div>
    </footer>
  );
}
