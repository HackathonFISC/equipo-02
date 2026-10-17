import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'border-border bg-muted text-foreground',
      success: 'border-success/50 bg-success/10 text-success',
      warning: 'border-warning/50 bg-warning/10 text-warning',
      danger: 'border-danger/50 bg-danger/10 text-danger',
      accent: 'border-coral/50 bg-coral/10 text-accent-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
