import { useSearchParams } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TaskChecklist from '../components/tasks/TaskChecklist';
import TaskManager from '../components/tasks/TaskManager';
import TaskProgress from '../components/tasks/TaskProgress';
import TaskBoard, { MyGarden, useBoard } from '../components/tasks/TaskBoard';
import MyRecord from '../components/tasks/MyRecord';

const TABS = [
  ['mine', 'مهامي', false],
  ['history', 'سجلّي', false],
  ['board', 'ساحة الهمّة', false],
  ['manage', 'إدارة المهام', true],
  ['progress', 'متابعة الأعضاء', true],
] as const;
type Tab = (typeof TABS)[number][0];

const HINTS: Record<Tab, string> = {
  mine: 'ضع علامة على كل مهمة تنجزها، واجمع النقاط وانمُ ببستانك — والأجر عند الله.',
  history: 'كل ما عملته منذ بدأت، محفوظ يومًا بيوم — لك وحدك.',
  board: 'أين إخوانك اليوم وهذا الأسبوع، وحال المجلس — ليشدّ بعضنا بعضًا.',
  manage: 'المهام التي يراها كل الأعضاء في صفحة «مهامي».',
  progress: 'من أنجز ماذا — المهام اليومية لليوم المختار، والأسبوعية لأسبوعه.',
};

/** The member's own tab: their garden on top, the checklist below; ticking refreshes the garden. */
function MineTab() {
  const { user } = useAuth();
  const { board, reload } = useBoard();
  return (
    <>
      <MyGarden me={board?.members.find((m) => m.id === user?.id)} />
      <TaskChecklist onTicked={() => void reload()} />
    </>
  );
}

/**
 * «المهام»: every member's checklist and the community board. Admins and
 * schedule managers also get tabs to write the tasks and follow who has done
 * them (?tab=board|manage|progress).
 */
export default function TasksPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || (user?.canManageSchedule ?? false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = TABS.filter(([, , managers]) => !managers || canManage);
  const asked = searchParams.get('tab');
  const tab: Tab = tabs.find(([key]) => key === asked)?.[0] ?? 'mine';

  return (
    <div className="container-site max-w-4xl py-8">
      <div className="page-header">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <ListChecks className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-black text-fg">المهام</h1>
          <p className="text-sm text-muted">{HINTS[tab]}</p>
        </div>
      </div>

      <div role="tablist" aria-label="أقسام المهام" className="tab-strip">
        {tabs.map(([key, label]) => (
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

      {tab === 'manage' ? (
        <TaskManager />
      ) : tab === 'progress' ? (
        <TaskProgress />
      ) : tab === 'board' ? (
        <TaskBoard />
      ) : tab === 'history' ? (
        <MyRecord />
      ) : (
        <MineTab />
      )}
    </div>
  );
}
