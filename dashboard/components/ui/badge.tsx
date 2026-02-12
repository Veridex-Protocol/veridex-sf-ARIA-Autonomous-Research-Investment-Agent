import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        success: 'border-transparent bg-emerald-500/15 text-emerald-400',
        warning: 'border-transparent bg-amber-500/15 text-amber-400',
        destructive: 'border-transparent bg-red-500/15 text-red-400',
        outline: 'border-border text-muted-foreground',
        x402: 'border-transparent bg-indigo-500/15 text-indigo-400',
        ucp: 'border-transparent bg-emerald-500/15 text-emerald-400',
        acp: 'border-transparent bg-amber-500/15 text-amber-400',
        ap2: 'border-transparent bg-rose-500/15 text-rose-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
