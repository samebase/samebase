import * as React from "react";
import {
  Button as BaseButton,
  type ButtonProps as BaseButtonProps,
} from "@/components/ui/button";
import {
  DEFAULT_CORNER_NOTCH_TYPE,
  getOptionalCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { useCornerNotchBridgeColor } from "@/hooks/useCornerNotchBridgeColor";
import { cn } from "@/lib/utils";

export interface ButtonProps extends BaseButtonProps {
  cornerNotch?: CornerNotchType;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, cornerNotch, ...props }, ref) => {
    const resolvedCornerNotch = cornerNotch ?? DEFAULT_CORNER_NOTCH_TYPE;
    const buttonRef = useCornerNotchBridgeColor(
      resolvedCornerNotch,
      ref,
      className,
    );

    return (
      <BaseButton
        ref={buttonRef}
        className={cn(
          getOptionalCornerNotchClass(resolvedCornerNotch),
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
