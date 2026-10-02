import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 px-6 py-12 text-center dark:border-brand-800/80 dark:bg-[#07160f]">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-gold-300">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-display text-lg font-extrabold text-brand-900 dark:text-stone-100">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}