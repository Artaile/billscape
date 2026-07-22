import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-indigo-600 text-white hover:bg-indigo-500',
        secondary:
          'border-transparent bg-zinc-700 text-zinc-200 hover:bg-zinc-600',
        destructive:
          'border-transparent bg-red-900/60 text-red-300 border-red-800',
        outline:
          'border-zinc-700 text-zinc-300 bg-transparent',
        success:
          'border-transparent bg-emerald-900/60 text-emerald-300 border-emerald-800',
        warning:
          'border-transparent bg-yellow-900/60 text-yellow-300 border-yellow-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
