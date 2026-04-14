import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";
import {
  DEFAULT_CORNER_NOTCH_FAMILY,
  DEFAULT_CORNER_NOTCH_TYPE,
  getOptionalCornerNotchClass,
  type CornerNotchFamily,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { useCornerNotchStyling } from "@/hooks/useCornerNotchStyling";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentPropsWithoutRef<
  typeof BaseInput
> {
  cornerNotch?: CornerNotchType;
  cornerNotchFamily?: CornerNotchFamily;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      cornerNotch,
      cornerNotchFamily = DEFAULT_CORNER_NOTCH_FAMILY,
      ...props
    },
    ref,
  ) => {
    const resolvedCornerNotch = cornerNotch ?? DEFAULT_CORNER_NOTCH_TYPE;
    const finalClassName = cn(
      getOptionalCornerNotchClass(resolvedCornerNotch, cornerNotchFamily),
      cornerNotchFamily === "pixel" && "rounded-none",
      className,
    );
    const inputRef = useCornerNotchStyling(
      resolvedCornerNotch,
      cornerNotchFamily,
      ref,
      finalClassName,
    );

    return <BaseInput ref={inputRef} className={finalClassName} {...props} />;
  },
);

Input.displayName = "Input";
