"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Checkbox as RadixCheckbox } from "radix-ui";
import { cn } from "@/lib/utils";

export type CheckboxProps = React.ComponentProps<typeof RadixCheckbox.Root>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input bg-background transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator data-slot="checkbox-indicator" className="grid place-content-center">
        <CheckIcon className="size-3.5" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
