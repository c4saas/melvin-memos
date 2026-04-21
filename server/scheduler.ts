import cron from 'node-cron';
import { syncAllCalendars, checkAndLaunchDueBots } from './services/calendar-poller';
import { createLogger } from './logger';

const log = createLogger('scheduler');

export function startScheduler() {
  cron.schedule('*/5 * * * *', () => {
    log.info('tick: syncing calendars');
    syncAllCalendars().catch(err => log.error('calendar sync error', err));
  });

  cron.schedule('* * * * *', () => {
    checkAndLaunchDueBots().catch(err => log.error('due-bots check error', err));
  });

  setTimeout(() => {
    syncAllCalendars().catch(err => log.error('startup sync error', err));
  }, 10_000);

  log.info('scheduler started');
}
