import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag as TagIcon, X, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';
import { cn } from '../lib/utils';

const COLORS = ['blue', 'purple', 'amber', 'green'] as const;

function colorFor(tag: string): (typeof COLORS)[number] {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function TagChips({
  tags,
  onRemove,
  size = 'md',
}: {
  tags: string[];
  onRemove?: (tag: string) => void;
  size?: 'sm' | 'md';
}) {
  if (!tags?.length) return null;
  const px = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {tags.map(t => (
        <span key={t} className={cn('os-badge', `os-badge-${colorFor(t)}`, px)}>
          <TagIcon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
          {t}
          {onRemove && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(t); }}
              aria-label={`Remove ${t}`}
              className="ml-0.5 -mr-0.5 opacity-60 hover:opacity-100"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export function TagEditor({
  meetingId,
  tags: initialTags,
  suggestions = [],
}: {
  meetingId: string;
  tags: string[];
  suggestions?: string[];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tags, setTags] = useState(initialTags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTags(initialTags), [initialTags]);

  const mutation = useMutation({
    mutationFn: (next: string[]) => api.updateTags(meetingId, next),
    onSuccess: (r) => {
      setTags(r.tags);
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (tags.includes(v)) return;
    const next = [...tags, v];
    setTags(next);
    mutation.mutate(next);
    setDraft('');
  };

  const remove = (t: string) => {
    const next = tags.filter(x => x !== t);
    setTags(next);
    mutation.mutate(next);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Escape') {
      setAdding(false);
      setDraft('');
    } else if (e.key === 'Backspace' && draft === '' && tags.length) {
      remove(tags[tags.length - 1]);
    }
  };

  const visibleSuggestions = suggestions
    .filter(s => !tags.includes(s))
    .filter(s => !draft || s.toLowerCase().includes(draft.toLowerCase()))
    .slice(0, 6);

  return (
    <div className="flex items-center flex-wrap gap-1.5">
      <TagChips tags={tags} onRemove={remove} />
      {adding ? (
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => { setTimeout(() => { if (draft) add(draft); setAdding(false); setDraft(''); }, 100); }}
            placeholder="Add tag…"
            className="bg-input/60 border border-border rounded-md px-2 py-0.5 text-[11px] min-w-[100px] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
          {visibleSuggestions.length > 0 && (
            <div className="absolute top-full mt-1 left-0 z-10 min-w-[140px] os-panel py-1 shadow-lg">
              {visibleSuggestions.map(s => (
                <button
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); add(s); }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-left hover:bg-accent/60"
                >
                  <TagIcon className="w-2.5 h-2.5 text-muted-foreground" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <Plus className="w-2.5 h-2.5" /> Tag
        </button>
      )}
    </div>
  );
}
