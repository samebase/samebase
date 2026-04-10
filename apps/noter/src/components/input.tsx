import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";
import {
  DEFAULT_CORNER_NOTCH_TYPE,
  getOptionalCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { useCornerNotchBridgeColor } from "@/hooks/useCornerNotchBridgeColor";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentPropsWithoutRef<
  typeof BaseInput
> {
  cornerNotch?: CornerNotchType;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, cornerNotch, ...props }, ref) => {
    const resolvedCornerNotch = cornerNotch ?? DEFAULT_CORNER_NOTCH_TYPE;
    const finalClassName = cn(
      getOptionalCornerNotchClass(resolvedCornerNotch),
      className,
    );
    const inputRef = useCornerNotchBridgeColor(
      resolvedCornerNotch,
      ref,
      finalClassName,
    );

    return <BaseInput ref={inputRef} className={finalClassName} {...props} />;
  },
);

Input.displayName = "Input";
