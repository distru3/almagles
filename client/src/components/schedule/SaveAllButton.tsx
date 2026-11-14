import { useCallback, useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { saveAll, useUnsavedCount, useUnsavedGuard } from '../../lib/unsaved';

const arNumber = new Intl.NumberFormat('ar');

/**
 * «حفظ الكل» for a schedule editor: shows how many rows / notes have unsaved
 * edits and saves them all. While mounted it also guards the page (leave
 * warning, Ctrl/Cmd+S saves).
 */
export default function SaveAllButton() {
  const count = useUnsavedCount();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'done' | 'failed' | null>(null);
  const timer = useRef<number>();
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setResult(null);
    window.clearTimeout(timer.current);
    const ok = await saveAll();
    busy.current = false;
    setSaving(false);
    setResult(ok ? 'done' : 'failed');
    if (ok) timer.current = window.setTimeout(() => setResult(null), 3000);
  }, []);

  useUnsavedGuard(run);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (count === 0 && !result) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {result === 'failed' && count > 0 ? (
        <span role="status" className="text-sm text-danger">تعذّر حفظ بعض التغييرات — راجع الصفوف المعلّمة</span>
      ) : result === 'done' && count === 0 ? (
        <span role="status" className="text-sm text-success">حُفظت كل التغييرات</span>
      ) : (
        count > 0 && (
          <span role="status" className="text-sm text-muted">
            {count === 1 ? 'تعديل واحد غير محفوظ' : `${arNumber.format(count)} تعديلات غير محفوظة`}
          </span>
        )
      )}
      {count > 0 && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={saving}
          title="حفظ الكل (Ctrl+S)"
          className="btn-primary !min-h-10 !px-4 !text-sm"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'جارٍ الحفظ…' : 'حفظ الكل'}
        </button>
      )}
    </div>
  );
}
