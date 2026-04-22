import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";
import { type CornerNotchType } from "@/lib/cornerNotch";

export interface InputProps extends React.ComponentPropsWithoutRef<
  typeof BaseInput
> {
  // Keep the prop temporarily so existing callsites stay readable during the migration.
  cornerNotch?: CornerNotchType;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ cornerNotch: _cornerNotch, ...props }, ref) => (
    <BaseInput ref={ref} {...props} />
  ),
);

Input.displayName = "Input";
