import * as React from "react"
import { cn } from "@/lib/cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-lg border border-input-border bg-transparent px-3 py-2 text-base transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground md:text-sm dark:bg-input/30 dark:disabled:bg-disabled",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
