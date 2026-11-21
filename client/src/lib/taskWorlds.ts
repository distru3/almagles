import {
  BookOpen,
  CloudRain,
  DoorOpen,
  Feather,
  Flower2,
  Gem,
  Heart,
  HeartHandshake,
  Hourglass,
  House,
  Lamp,
  Landmark,
  Layers,
  MoonStar,
  Repeat,
  Shield,
  ShieldCheck,
  Sprout,
  Sun,
  Sunrise,
  TreePalm,
  Users,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { DAWAM, FADAIL, fadailFor, type Text } from './fadail';
import type { TaskTime } from './types';

/**
 * «ما تبنيه»: every task in «سجلّي» is something the member is building, one
 * tick at a time — «أرض العلم التي تزرعها», «شفيعك يوم القيامة»… Each world
 * stands on a text already in `fadail.ts` (shown beneath it with its source),
 * so the image never promises more than the text says. To add a world, add
 * its deed to FADAIL first, then an entry here with the same id.
 */
export interface World {
  /** What the member is building, e.g. «أرض العلم التي تزرعها». */
  name: string;
  icon: LucideIcon;
  /** «سلكت طريق العلم» + «٤٢ مرة». */
  verb: string;
  /** The text the image rests on, from fadail.ts. */
  text: Text;
}

const textOf = (id: string, index = 0): Text => FADAIL.find((f) => f.id === id)?.texts[index] ?? DAWAM;

const WORLDS: Record<string, Omit<World, 'text'> & { text: [string, number] }> = {
  quran: { name: 'شفيعك يوم القيامة', icon: BookOpen, verb: 'قرأت وردك', text: ['quran', 2] },
  hifz: { name: 'منزلتك عند آخر آية', icon: Layers, verb: 'راجعت حفظك', text: ['hifz', 0] },
  tadabbur: { name: 'مصابيح التدبّر', icon: Lamp, verb: 'تدبّرت', text: ['tadabbur', 0] },
  kahf: { name: 'نورٌ ما بين الجمعتين', icon: Sun, verb: 'قرأت الكهف', text: ['kahf', 0] },
  mulk: { name: 'سورةٌ تشفع لك', icon: ShieldCheck, verb: 'قرأت تبارك', text: ['mulk', 0] },
  qiyam: { name: 'ليالٍ أحييتها', icon: MoonStar, verb: 'قمت الليل', text: ['qiyam', 0] },
  adhkar: { name: 'صباحاتك ومساءاتك مع الله', icon: Sunrise, verb: 'ذكرت ربك', text: ['adhkar', 0] },
  tasbih: { name: 'غِراسك في الجنة', icon: TreePalm, verb: 'سبّحت', text: ['tasbih', 1] },
  tahlil: { name: 'حرزك من الشيطان', icon: Shield, verb: 'هلّلت', text: ['tahlil', 0] },
  hawqala: { name: 'كنزٌ من كنوز الجنة', icon: Gem, verb: 'قلتها', text: ['hawqala', 0] },
  istighfar: { name: 'غيث الاستغفار', icon: CloudRain, verb: 'استغفرت', text: ['istighfar', 0] },
  salawat: { name: 'صلواتٌ تعود إليك عشرًا', icon: Heart, verb: 'صلّيت على النبي ﷺ', text: ['salawat', 1] },
  duha: { name: 'صدقةٌ عن مفاصلك', icon: Sun, verb: 'صلّيت الضحى', text: ['duha', 0] },
  rawatib: { name: 'بيتك في الجنة', icon: House, verb: 'صلّيت الرواتب', text: ['rawatib', 0] },
  jamaah: { name: 'سبعٌ وعشرون درجة', icon: Landmark, verb: 'صلّيت في جماعة', text: ['jamaah', 1] },
  siyam: { name: 'سبعون خريفًا عن النار', icon: Hourglass, verb: 'صمت', text: ['siyam', 0] },
  sadaqah: { name: 'سنابلك المضاعفة', icon: Wheat, verb: 'تصدّقت', text: ['sadaqah', 0] },
  ilm: { name: 'أرض العلم التي تزرعها', icon: Sprout, verb: 'سلكت طريق العلم', text: ['ilm', 0] },
  dua: { name: 'أبوابٌ طرقتها بالدعاء', icon: DoorOpen, verb: 'دعوت', text: ['dua', 0] },
  walidayn: { name: 'برّك بوالديك', icon: HeartHandshake, verb: 'بررت والديك', text: ['walidayn', 0] },
  rahim: { name: 'بسطةٌ في رزقك وأثرك', icon: Users, verb: 'وصلت رحمك', text: ['rahim', 0] },
  iyadah: { name: 'خُرفة الجنة', icon: Flower2, verb: 'عدت مريضًا', text: ['iyadah', 0] },
  dhikr: { name: 'طمأنينة قلبك', icon: Feather, verb: 'ذكرت الله', text: ['dhikr', 0] },
};

/** For a task no deed matches: the steady deed Allah loves. */
const STEADY: World = { name: 'عملك الدائم', icon: Repeat, verb: 'أدّيتها', text: DAWAM };

/** The world a task builds, matched from its title and details like «فضلها»; «قيام الليل» by its time too. */
export function worldFor(task: { title: string; description?: string | null; timeWindow: TaskTime }): World {
  const id = task.timeWindow === 'qiyam' ? 'qiyam' : fadailFor(`${task.title} ${task.description ?? ''}`, 1)[0]?.id;
  const w = id ? WORLDS[id] : undefined;
  return w ? { ...w, text: textOf(...w.text) } : STEADY;
}

const arNumber = new Intl.NumberFormat('ar');

/** «مرة واحدة», «مرتين», «٥ مرات», «٤٢ مرة». */
export function timesWord(n: number): string {
  if (n === 1) return 'مرة واحدة';
  if (n === 2) return 'مرتين';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} مرات`;
  return `${arNumber.format(n)} مرة`;
}

/** Round numbers of times on the way, for each task's next stop. */
const STOPS = [1, 7, 30, 100, 365, 1000];

/** The next stop for a task done `n` times, and how far along the way to it (0–1); null past the last. */
export function nextStop(n: number): { at: number; progress: number } | null {
  const i = STOPS.findIndex((s) => n < s);
  if (i === -1) return null;
  const prev = i === 0 ? 0 : STOPS[i - 1];
  return { at: STOPS[i], progress: (n - prev) / (STOPS[i] - prev) };
}
