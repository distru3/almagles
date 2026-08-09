export default function Footer() {
  return (
    <footer className="mt-12 border-t border-brand-100 bg-brand-950 py-8 text-center text-brand-100">
      <p className="font-display text-lg font-bold">رجال الأمة</p>
      <p className="mt-1 text-sm text-brand-200/80">جدول المقرر الأسبوعي والمنشورات اليومية</p>
      <p className="mt-3 text-xs text-brand-300/60">© {new Date().getFullYear()} — جميع الحقوق محفوظة</p>
    </footer>
  );
}