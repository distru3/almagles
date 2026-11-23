import { prisma } from '../db.js';
import { COMEBACK_BONUS, appliesOn, areMutuallyExclusive, periodOf, shiftDate } from './taskSchedule.js';

/**
 * «عودة حميدة»: the first tick of `day` after two or more days with nothing
 * done and no excuse, by a member who had taken part before.
 */
export async function isComeback(userId: string, day: string): Promise<boolean> {
  const gap = { gte: shiftDate(day, -2), lte: day };
  const [recent, excused, before] = await Promise.all([
    prisma.taskCompletion.count({ where: { userId, day: gap } }),
    prisma.taskExcuse.count({ where: { userId, day: { gte: shiftDate(day, -2), lt: day } } }),
    prisma.taskCompletion.count({ where: { userId, day: { lt: shiftDate(day, -2) } } }),
  ]);
  return recent === 0 && excused === 0 && before > 0;
}

/**
 * «طلب العلم» ticked by «رحلة العلم»: whatever the member records of a lesson —
 * finished or only part of it — ticks each task the managers linked to the
 * journey, for the member's own `day`, with its points as if ticked by hand.
 * A task's time window doesn't hold it back: learning has no set hour. Tasks
 * already ticked, not set for that day, or that can't go with one already done
 * are left as they are. Returns the titles ticked now, for the member's toast.
 */
export async function tickLearningTasks(userId: string, day: string): Promise<string[]> {
  const linked = await prisma.task.findMany({
    where: { active: true, fromLearning: true },
    select: { id: true, title: true, repeat: true, points: true, startDate: true, endDate: true, weekdays: true, timeWindow: true, startTime: true, endTime: true },
  });
  const ticked: string[] = [];
  for (const task of linked.filter((t) => appliesOn(t, day))) {
    const key = { taskId: task.id, userId, period: periodOf(task.repeat, day) };
    const [existing, others] = await Promise.all([
      prisma.taskCompletion.findUnique({ where: { taskId_userId_period: key }, select: { id: true } }),
      prisma.taskCompletion.findMany({ where: { userId, period: key.period }, select: { task: { select: { title: true } } } }),
    ]);
    if (existing || others.some((o) => areMutuallyExclusive(task.title, o.task.title))) continue;
    const points = task.points + ((await isComeback(userId, day)) ? COMEBACK_BONUS : 0);
    await prisma.taskCompletion.upsert({ where: { taskId_userId_period: key }, create: { ...key, day, points }, update: {} });
    ticked.push(task.title);
  }
  return ticked;
}
