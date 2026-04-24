import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Highlighter, Trash2, Quote, Plus } from 'lucide-react';
import { api, type Highlight } from '../lib/api';
import { useToast } from './Toast';
import { Button } from './Button';
import { cn } from '../lib/utils';

const COLORS: Array<{ id: string; bg: string; bar: string; label: string }> = [
  { id: 'yellow', bg: 'hsl(50 95% 75% / 0.15)', bar: 'hsl(50 95% 55%)', label: 'Yellow' },
  { id: 'green',  bg: 'hsl(142 71% 45% / 0.15)', bar: 'hsl(142 71% 45%)', label: 'Green' },
  { id: 'blue',   bg: 'hsl(217 91% 60% / 0.15)', bar: 'hsl(217 91% 60%)', label: 'Blue' },
  { id: 'pink',   bg: 'hsl(330 81% 60% / 0.15)', bar: 'hsl(330 81% 60%)', label: 'Pink' },
];

function colorFor(id: string) {
  return COLORS.find(c => c.id === id) ?? COLORS[0];
}

export function HighlightsPanel({
  meetingId,
  transcriptRef,
}: {
  meetingId: string;
  transcriptRef: React.RefObject<HTMLElement>;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [color, setColor] = useState('yellow');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: highlights = [] } = useQuery<Highlight[]>({
    queryKey: ['highlights', meetingId],
    queryFn: () => api.listHighlights(meetingId),
  });

  const createMut = useMutation({
    mutationFn: (body: { text: string; note?: string; color?: string }) =>
      api.createHighlight({ meetingId, ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights', meetingId] });
      setDraft('');
      setNote('');
      toast.success('Highlight saved');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteHighlight(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['highlights', meetingId] }),
  });

  // Listen for selection within transcriptRef; show floating save button elsewhere
  const [selection, setSelection] = useState<string | null>(null);
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setSelection(null); return; }
      const container = transcriptRef.current;
      if (!container) { setSelection(null); return; }
      if (!container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) {
        setSelection(null); return;
      }
      const text = sel.toString().trim();
      setSelection(text.length > 5 ? text : null);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [transcriptRef]);

  const captureSelection = () => {
    if (!selection) {
      toast.info('Select text in the transcript first');
      return;
    }
    setDraft(selection);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    createMut.mutate({ text, note: note.trim() || undefined, color });
  };

  return (
    <section className="os-panel p-5 sm:p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-base sm:text-lg flex items-center gap-2">
          <Highlighter className="w-4 h-4 text-primary" /> Highlights
          <span className="text-xs font-sans font-normal text-muted-foreground">{highlights.length}</span>
        </h2>
        {selection && (
          <Button variant="primary" size="sm" onClick={captureSelection} className="animate-in fade-in-50">
            <Plus className="w-3.5 h-3.5" /> Capture selection
          </Button>
        )}
      </div>

      {highlights.length === 0 && !draft && (
        <p className="text-xs text-muted-foreground mb-3">
          Select text in the transcript below to save a quote, or paste a passage into the box.
        </p>
      )}

      {/* Saved highlights */}
      {highlights.length > 0 && (
        <ul className="space-y-2.5 mb-4">
          {highlights.map(h => {
            const c = colorFor(h.color);
            return (
              <li
                key={h.id}
                className="relative rounded-lg px-3.5 py-2.5 pl-4 group"
                style={{
                  background: c.bg,
                  borderLeft: `3px solid ${c.bar}`,
                }}
              >
                <div className="flex items-start gap-2">
                  <Quote className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug text-foreground">{h.text}</div>
                    {h.note && (
                      <div className="text-[11px] text-muted-foreground mt-1 italic">{h.note}</div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteMut.mutate(h.id)}
                    aria-label="Delete highlight"
                    className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Draft input */}
      <div className="border-t border-border/60 pt-4">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Paste or type a quote — or select text in the transcript…"
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
        {draft && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 animate-in fade-in-50 duration-150">
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
                className="bg-input/50 border border-border rounded-md px-2.5 py-1 text-xs min-w-[180px]"
              />
              <div className="inline-flex items-center gap-1 p-0.5 bg-input/40 border border-border rounded-md">
                {COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setColor(c.id)}
                    aria-label={c.label}
                    className={cn(
                      'w-5 h-5 rounded border border-border/50 transition-transform',
                      color === c.id && 'scale-110 ring-2 ring-primary/40',
                    )}
                    style={{ background: c.bar }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setNote(''); }}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={save} disabled={createMut.isPending}>
                {createMut.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
