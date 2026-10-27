import { config } from './config.js';
import { col } from './lib/collections.js';
import { getAllDocs } from './lib/docs.js';
import { runScrapeJob } from './scraper/runner.js';

/**
 * Jobs run one at a time because each one launches a headless browser.
 * Every SCHEDULER_TICK_MS the scheduler reads enabled schedules that are due and queues them.
 */
const queue = [];
const queuedScheduleIds = new Set();
let current = null;
let draining = false;
let ticking = false;
let timer = null;

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000).toISOString();

async function labelFor(sourceId, categoryId) {
  const [source, category] = await getAllDocs([col.sources.doc(sourceId), col.categories.doc(categoryId)]);
  if (!source.exists || !category.exists) return 'unknown job';
  return `${category.get('name')} on ${source.get('name')}`;
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const job = queue.shift();
    current = { label: job.label, trigger: job.trigger, startedAt: new Date().toISOString() };
    try {
      await runScrapeJob(job);
    } catch (err) {
      console.error('Unexpected scrape failure:', err);
    } finally {
      if (job.scheduleId) queuedScheduleIds.delete(job.scheduleId);
    }
  }
  current = null;
  draining = false;
}

/** Adds a job to the queue. Returns false when the same schedule is already queued or running. */
async function enqueue(job) {
  if (job.scheduleId && queuedScheduleIds.has(job.scheduleId)) return false;
  if (job.scheduleId) queuedScheduleIds.add(job.scheduleId);
  try {
    const label = await labelFor(job.sourceId, job.categoryId);
    queue.push({ ...job, label });
  } catch (err) {
    if (job.scheduleId) queuedScheduleIds.delete(job.scheduleId);
    throw err;
  }
  drain();
  return true;
}

/** Queue a schedule now. Its next due time moves forward by one interval. */
export async function runScheduleNow(scheduleId) {
  const snap = await col.schedules.doc(scheduleId).get();
  if (!snap.exists) return { ok: false, reason: 'Schedule not found' };
  if (queuedScheduleIds.has(scheduleId)) return { ok: false, reason: 'This schedule is already queued or running' };

  const schedule = snap.data();
  const queued = await enqueue({
    scheduleId,
    sourceId: schedule.sourceId,
    categoryId: schedule.categoryId,
    maxPages: schedule.maxPages,
    trigger: 'manual',
  });
  if (!queued) return { ok: false, reason: 'This schedule is already queued or running' };

  await col.schedules.doc(scheduleId)
    .update({ nextRunAt: addMinutes(new Date(), schedule.intervalMinutes) })
    .catch(() => {});
  return { ok: true };
}

/** One-off scrape that is not tied to a schedule. */
export async function runAdHoc({ sourceId, categoryId, maxPages }) {
  await enqueue({ scheduleId: null, sourceId, categoryId, maxPages, trigger: 'manual' });
  return { ok: true };
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const dueSnap = await col.schedules
      .where('enabled', '==', true)
      .where('nextRunAt', '<=', now.toISOString())
      .get();
    if (dueSnap.empty) return;

    const due = dueSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const sourceIds = [...new Set(due.map((s) => s.sourceId))];
    const sourceSnaps = await getAllDocs(sourceIds.map((id) => col.sources.doc(id)));
    const enabledSources = new Set(
      sourceSnaps.filter((snap) => snap.exists && snap.get('enabled') === true).map((snap) => snap.id),
    );

    for (const schedule of due) {
      if (!enabledSources.has(schedule.sourceId)) continue;
      try {
        // Advance first so a slow job cannot be picked up again by the next tick.
        await col.schedules.doc(schedule.id).update({ nextRunAt: addMinutes(now, schedule.intervalMinutes) });
        await enqueue({
          scheduleId: schedule.id,
          sourceId: schedule.sourceId,
          categoryId: schedule.categoryId,
          maxPages: schedule.maxPages,
          trigger: 'scheduled',
        });
      } catch (err) {
        // The schedule may have been deleted between the read and the write.
        console.error(`Could not queue schedule ${schedule.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Scheduler tick failed:', err.message);
  } finally {
    ticking = false;
  }
}

export function startScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, config.schedulerTickMs);
  console.log(`Scheduler running, checking every ${config.schedulerTickMs / 1000}s`);
}

export function getSchedulerState() {
  return {
    running: current,
    queued: queue.map((job) => ({ label: job.label, trigger: job.trigger })),
  };
}
