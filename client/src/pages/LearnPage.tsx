import { useSearchParams } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { confirmDiscard } from '../lib/unsaved';
import MyJourney from '../components/learning/MyJourney';
import Companions from '../components/learning/Companions';
import LearningManager from '../components/learning/LearningManager';
import SharedNotesFeed from '../components/learning/SharedNotes';
import MyNotes from '../components/learning/MyNotes';

const TABS = [
  ['mine', 'رحلتي', false],
  ['notes', 'فوائدي', false],
  ['companions', 'رفقاء الرحلة', false],
  ['fawaid', 'فوائد الإخوة', false],
  ['manage', 'إدارة الرحلة', true],
] as const;
type Tab = (typeof TABS)[number][0];

const HINTS: Record<Tab, string> = {
  mine: 'درس كل يوم مع إخوانك — قراءة أو استماع أو مشاهدة — والجمعة استجمام.',
  notes: 'كل فائدة كتبتها من دروسك، محفوظة لك — تعود إليها، وتهذّبها، وتشاركها متى شئت.',
  companions: 'إخوانك على الطريق نفسه، وأين بلغ كلٌّ منهم — ليشدّ بعضنا بعضًا.',
  fawaid: 'ما شاركه الإخوة من فوائد دروسهم — تدارسوها، وزيدوا عليها، وادعوا لأصحابها.',
  manage: 'تقويم الرحلة: ما يُدرس كل يوم، ومن أتمّه من الإخوة، وتذكير من تأخّر.',
};

/**
 * «رحلة العلم»: a shared calendar of lessons every member may choose to walk.
 * Admins and schedule managers also get the tab that writes it (?tab=manage).
 */
export default function LearnPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || (user?.canManageSchedule ?? false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = TABS.filter(([, , managers]) => !managers || canManage);
  const asked = searchParams.get('tab');
  const tab: Tab = tabs.find(([key]) => key === asked)?.[0] ?? 'mine';

  return (
    <div className="container-site max-w-4xl py-8">
      <div className="page-header">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <GraduationCap className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-black text-fg">رحلة العلم</h1>
          <p className="text-sm text-muted">{HINTS[tab]}</p>
        </div>
      </div>

      <div role="tablist" aria-label="أقسام رحلة العلم" className="tab-strip">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => key !== tab && confirmDiscard() && setSearchParams(key === 'mine' ? {} : { tab: key })}
            className={`min-h-10 rounded-full px-4 font-display text-[15px] transition ${
              tab === key ? 'bg-accent-fill text-on-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'manage' ? (
        <LearningManager />
      ) : tab === 'companions' ? (
        <Companions />
      ) : tab === 'fawaid' ? (
        <SharedNotesFeed />
      ) : tab === 'notes' ? (
        <MyNotes />
      ) : (
        <MyJourney />
      )}
    </div>
  );
}
