import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

// Added for the Sync screen (S2), which is the app's first multi-select list.
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-[4px] border border-zinc-700 bg-surface-control transition-colors',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-indigo focus-visible:ring-offset-0',
      'disabled:cursor-not-allowed disabled:opacity-50',
      // `indeterminate` keeps the neutral border — it's a group summary, not a
      // value the row itself carries.
      'data-[state=checked]:border-primary data-[state=checked]:bg-nav-active',
      'data-[state=indeterminate]:bg-nav-active',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      {props.checked === 'indeterminate' ? (
        <Minus className="h-2.5 w-2.5 text-mono-keyword" strokeWidth={3} />
      ) : (
        <Check className="h-2.5 w-2.5 text-accent-indigo-bright" strokeWidth={3.5} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
