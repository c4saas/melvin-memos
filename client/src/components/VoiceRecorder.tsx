import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Pause, Play, X, Upload, CircleDot } from 'lucide-react';
import { Button } from './Button';
import { useToast } from './Toast';
import { api, type Meeting } from '../lib/api';
import { cn } from '../lib/utils';

const MAX_SECONDS = 2 * 60 * 60; // 2 hours

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
function formatTimer(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2', // Safari
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export function VoiceRecorder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (m: Meeting) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(() => {
    const d = new Date();
    return `Voice note — ${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  });
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'stopped' | 'uploading'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const finalBlobRef = useRef<Blob | null>(null);
  const tickerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (tickerRef.current != null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => cleanup, []);

  const start = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone recording is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        finalBlobRef.current = new Blob(chunksRef.current, { type });
        setState('stopped');
        cleanup();
      };
      rec.onerror = (ev: any) => {
        setError(ev?.error?.message ?? 'Recorder error');
        cleanup();
      };
      rec.start(1000);
      setState('recording');
      setElapsed(0);
      tickerRef.current = window.setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MAX_SECONDS) stop();
          return next;
        });
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start recorder');
      cleanup();
      setState('idle');
    }
  };

  const pause = () => {
    recorderRef.current?.pause();
    if (tickerRef.current != null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setState('paused');
  };

  const resume = () => {
    recorderRef.current?.resume();
    tickerRef.current = window.setInterval(() => setElapsed(p => p + 1), 1000);
    setState('recording');
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (tickerRef.current != null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (rec.state !== 'inactive') rec.stop();
  };

  const upload = async () => {
    const blob = finalBlobRef.current;
    if (!blob) return;
    setState('uploading');
    try {
      const meeting = await api.uploadVoiceRecording(blob, title.trim() || 'Voice recording', elapsed);
      toast.success('Uploaded — transcribing in the background');
      onCreated(meeting);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
      setState('stopped');
    }
  };

  const discard = () => {
    finalBlobRef.current = null;
    chunksRef.current = [];
    setElapsed(0);
    setState('idle');
  };

  const dot = state === 'recording';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={state === 'idle' ? onClose : undefined}>
      <div
        className="surface-1 w-full max-w-md p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <Mic className="w-4 h-4" /> Record voice
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
            disabled={state === 'uploading'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
            placeholder="Voice note"
            disabled={state === 'uploading'}
          />
        </div>

        <div className="flex flex-col items-center py-6 border border-dashed border-border rounded-lg mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                'inline-block w-2.5 h-2.5 rounded-full',
                dot ? 'bg-destructive animate-pulse' : 'bg-muted-foreground/40',
              )}
            />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {state === 'idle' && 'Ready'}
              {state === 'recording' && 'Recording'}
              {state === 'paused' && 'Paused'}
              {state === 'stopped' && 'Stopped'}
              {state === 'uploading' && 'Uploading…'}
            </span>
          </div>
          <div className="font-display font-semibold text-4xl tabular-nums">
            {formatTimer(elapsed)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Max {formatTimer(MAX_SECONDS)}
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/30">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {state === 'idle' && (
            <Button variant="primary" onClick={start}>
              <CircleDot className="w-4 h-4" /> Start recording
            </Button>
          )}
          {state === 'recording' && (
            <>
              <Button variant="secondary" onClick={pause}>
                <Pause className="w-4 h-4" /> Pause
              </Button>
              <Button variant="primary" onClick={stop}>
                <Square className="w-4 h-4" /> Stop
              </Button>
            </>
          )}
          {state === 'paused' && (
            <>
              <Button variant="secondary" onClick={resume}>
                <Play className="w-4 h-4" /> Resume
              </Button>
              <Button variant="primary" onClick={stop}>
                <Square className="w-4 h-4" /> Stop
              </Button>
            </>
          )}
          {state === 'stopped' && (
            <>
              <Button variant="ghost" onClick={discard}>Discard</Button>
              <Button variant="primary" onClick={upload}>
                <Upload className="w-4 h-4" /> Upload & transcribe
              </Button>
            </>
          )}
          {state === 'uploading' && (
            <Button variant="primary" disabled>
              <Upload className="w-4 h-4 animate-pulse" /> Uploading…
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Audio is uploaded to your instance, transcribed (Groq), summarized (Ollama), and stored like any other meeting.
        </p>
      </div>
    </div>
  );
}
