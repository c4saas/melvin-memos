import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant = 'secondary', size = 'md', ...props }, ref) => {
  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:bg-accent border border-border',
        variant === 'ghost' && 'hover:bg-accent text-foreground',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        className,
      )}
    />
  );
});
Button.displayName = 'Button';
