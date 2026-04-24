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
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] hover-elevate active-elevate-2 overflow-hidden',
        size === 'sm' && 'px-3 py-1.5 text-xs min-h-[32px]',
        size === 'md' && 'px-4 py-2 text-sm min-h-[36px]',
        variant === 'primary' && 'bg-primary text-primary-foreground shadow-sm',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground border border-border',
        variant === 'ghost' && 'text-foreground',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground shadow-sm',
        className,
      )}
    />
  );
});
Button.displayName = 'Button';
