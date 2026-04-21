import { useState, type FormEvent } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useBranding } from '../hooks/useBranding';

type Props = {
  defaultEmail?: string;
  defaultName?: string;
  onComplete: () => void;
};

export default function SetupPage({ defaultEmail, defaultName, onComplete }: Props) {
  const brand = useBranding();
  const [name, setName] = useState(defaultName ?? '');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, name, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Setup failed');
        return;
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle compact /></div>
      <div className="w-full max-w-[440px]">
        <div className="flex items-center gap-3 mb-8 justify-center">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} className="w-11 h-11 rounded-xl object-cover" />
          ) : (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, hsl(${brand.primaryHsl}), hsl(${brand.accentHsl}))` }}
            >
              <Mic className="w-6 h-6 text-background" strokeWidth={2.5} />
            </div>
          )}
          <div>
            <div className="font-display font-semibold text-xl leading-tight memos-gradient-text">{brand.name}</div>
            <div className="text-xs text-muted-foreground leading-tight">{brand.tagline}</div>
          </div>
        </div>

        <form onSubmit={submit} className="surface-1 p-7">
          <h1 className="font-display text-lg font-semibold mb-1">Welcome — let's get you set up</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Create your admin account. You'll use these credentials to sign in from now on.
          </p>

          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Your name</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mb-4"
            placeholder="Austin"
            autoComplete="name"
          />

          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mb-4"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mb-4"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
            minLength={8}
          />

          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mb-5"
            autoComplete="new-password"
            required
            minLength={8}
          />

          {error && (
            <div className="mb-4 px-3 py-2 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/30">
              {error}
            </div>
          )}

          <Button variant="primary" size="md" className="w-full" disabled={submitting || !email || !password || !confirm}>
            {submitting ? 'Creating account…' : 'Create account & continue'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-5">
          This is a one-time setup. Your password is hashed with bcrypt — we never store plaintext.
        </p>
      </div>
    </div>
  );
}
