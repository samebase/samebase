import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";
import {
  getOptionalCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.ComponentPropsWithoutRef<typeof BaseInput> {
  cornerNotch?: CornerNotchType;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, cornerNotch, ...props }, ref) => (
    <BaseInput
      ref={ref}
      className={cn(getOptionalCornerNotchClass(cornerNotch), className)}
      {...props}
    />
  ),
);

Input.displayName = "Input";
