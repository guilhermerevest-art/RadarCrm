import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border border-primary/20',
        secondary: 'bg-secondary/10 text-secondary border border-secondary/20',
        destructive: 'bg-destructive/10 text-destructive border border-destructive/20',
        success: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
        warning: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
        info: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
        outline: 'bg-transparent border border-border text-foreground',
        ghost: 'bg-transparent text-muted-foreground hover:text-foreground',
        subtle: 'bg-muted/50 text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
