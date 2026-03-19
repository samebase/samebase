import * as React from "react";
import {
  Button as BaseButton,
  type ButtonProps as BaseButtonProps,
} from "@/components/ui/button";
import {
  getOptionalCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { cn } from "@/lib/utils";

export interface ButtonProps extends BaseButtonProps {
  cornerNotch?: CornerNotchType;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, cornerNotch, ...props }, ref) => (
    <BaseButton
      ref={ref}
      className={cn(getOptionalCornerNotchClass(cornerNotch), className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";
