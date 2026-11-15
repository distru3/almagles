import { Flame, Medal, MoonStar, Sprout, Leaf, TreeDeciduous, TreePalm, Trees, Mountain, type LucideIcon } from 'lucide-react';
import type { BadgeId } from './types';
import { DAWAM, type Text } from './fadail';

/**
 * The garden every member grows. Points are only a nudge — the reward itself is
 * with Allah — so levels are named after a garden growing, inspired by
 * «من قال: سبحان الله العظيم وبحمده، غُرست له نخلة في الجنة».
 */
export interface Level {
  min: number;
  name: string;
  icon: LucideIcon;
}

export const LEVELS: Level[] = [
  { min: 0, name: 'بذرة', icon: Sprout },
  { min: 150, name: 'غرسة', icon: Leaf },
  { min: 600, name: 'شجرة', icon: TreeDeciduous },
  { min: 1500, name: 'نخلة', icon: TreePalm },
  { min: 4000, name: 'بستان', icon: Trees },
  { min: 10000, name: 'جبل همّة', icon: Mountain },
];

export function levelOf(total: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && total >= LEVELS[i + 1].min) i += 1;
  const next = LEVELS[i + 1] ?? null;
  return {
    index: i,
    level: LEVELS[i],
    next,
    /** 0–1 progress towards the next level. */
    progress: next ? (total - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1,
  };
}

export const BADGES: Record<BadgeId, { name: string; hint: string; icon: LucideIcon; text?: Text }> = {
  steady: { name: 'المداوم', hint: 'سبعة أيام متتالية', icon: Flame, text: DAWAM },
  firm: { name: 'الثابت', hint: 'ثلاثون يومًا متتالية', icon: Medal, text: DAWAM },
  qawwam: { name: 'قوّام الليل', hint: 'سبع ليالٍ من القيام', icon: MoonStar },
  hundred: { name: 'مئة عمل', hint: 'مئة مهمة منجزة', icon: Medal },
};
