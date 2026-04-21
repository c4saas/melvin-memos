type Level = 'debug' | 'info' | 'warn' | 'error';

function fmt(level: Level, scope: string, msg: string, meta?: unknown) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${scope}] ${msg}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  } catch {
    return `${base} [unserializable]`;
  }
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => {
      if (process.env.LOG_LEVEL === 'debug') console.log(fmt('debug', scope, msg, meta));
    },
    info: (msg: string, meta?: unknown) => console.log(fmt('info', scope, msg, meta)),
    warn: (msg: string, meta?: unknown) => console.warn(fmt('warn', scope, msg, meta)),
    error: (msg: string, meta?: unknown) => console.error(fmt('error', scope, msg, meta)),
  };
}

export const logger = createLogger('memos');
