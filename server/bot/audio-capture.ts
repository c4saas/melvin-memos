import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { createLogger } from '../logger';

const log = createLogger('audio-capture');

export class AudioCapture {
  private ffmpeg: ChildProcess | null = null;
  private outPath: string;
  private startedAt: number | null = null;

  constructor(outPath: string) {
    this.outPath = outPath;
  }

  async start(): Promise<void> {
    if (this.ffmpeg) throw new Error('audio capture already running');
    await fs.mkdir(dirname(this.outPath), { recursive: true });

    const device = process.env.PULSE_MONITOR ?? 'virtual_speaker.monitor';

    const args = [
      '-y',
      '-f', 'pulse',
      '-i', device,
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'libmp3lame',
      '-b:a', '48k',
      this.outPath,
    ];

    log.info('starting ffmpeg capture', { device, out: this.outPath });
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.ffmpeg = proc;
    this.startedAt = Date.now();

    proc.on('exit', (code) => {
      log.info('ffmpeg exited', { code });
      if (this.ffmpeg === proc) this.ffmpeg = null;
    });

    await new Promise<void>((resolve, reject) => {
      const onData = (d: Buffer) => {
        const s = String(d);
        if (/Error|error|Invalid|cannot open/.test(s) && !/^\s*$/.test(s)) {
          log.warn('ffmpeg stderr', s.trim());
        }
        if (/Press \[q\] to stop|size=\s*\d/.test(s)) {
          proc.stderr?.off('data', onData);
          clearTimeout(timer);
          resolve();
        }
      };
      const onExitEarly = () => reject(new Error('ffmpeg exited before becoming ready'));
      const timer = setTimeout(() => {
        proc.stderr?.off('data', onData);
        proc.off('exit', onExitEarly);
        log.warn('ffmpeg readiness timeout — proceeding anyway');
        resolve();
      }, 5000);
      proc.stderr?.on('data', onData);
      proc.once('exit', onExitEarly);
    });

    proc.stderr?.on('data', (d) => {
      const s = String(d);
      if (/Error|cannot open/.test(s)) log.warn('ffmpeg', s.trim());
    });
  }

  async stop(): Promise<{ path: string; durationSec: number } | null> {
    if (!this.ffmpeg) return null;
    const durationSec = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;

    this.ffmpeg.kill('SIGINT');
    await new Promise<void>((resolve) => {
      if (!this.ffmpeg) return resolve();
      this.ffmpeg.once('exit', () => resolve());
      setTimeout(() => resolve(), 5000);
    });

    this.ffmpeg = null;
    return { path: this.outPath, durationSec };
  }
}
