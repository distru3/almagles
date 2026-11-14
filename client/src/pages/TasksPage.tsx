import { useSearchParams } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TaskChecklist from '../components/tasks/TaskChecklist';
import TaskManager from '../components/tasks/TaskManager';
import TaskProgress from '../components/tasks/TaskProgress';

const TABS = [
  ['mine', 'مهامي'],
  ['manage', 'إدارة المهام'],
  ['progress', 'متابعة الأعضاء'],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * «مهامي»: every member's checklist. Admins and schedule managers also get
 * tabs to write the tasks and follow who has done them (?tab=manage|progress).
 */
export default function TasksPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || (user?.canManageSchedule ?? false);
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get('tab') as Tab | null;
  const tab: Tab = canManage && (asked === 'manage' || asked === 'progress') ? asked : 'mine';

  return (
    <div className="container-site max-w-4xl py-8">
      <div className="page-header">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <ListChecks className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-black text-fg">المهام</h1>
          <p className="text-sm text-muted">
            {tab === 'mine'
              ? 'ضع علامة على كل مهمة تنجزها — المهام اليومية تتجدد كل يوم، والأسبوعية كل سبت.'
              : tab === 'manage'
                ? 'المهام التي يراها كل الأعضاء في صفحة «مهامي».'
                : 'من أنجز ماذا — المهام اليومية لليوم المختار، والأسبوعية لأسبوعه.'}
          </p>
        </div>
      </div>

      {canManage && (
        <div role="tablist" aria-label="أقسام المهام" className="tab-strip">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setSearchParams(key === 'mine' ? {} : { tab: key })}
              className={`min-h-10 rounded-full px-4 font-display text-[15px] transition ${
                tab === key ? 'bg-accent-fill text-on-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'manage' ? <TaskManager /> : tab === 'progress' ? <TaskProgress /> : <TaskChecklist />}
    </div>
  );
}
