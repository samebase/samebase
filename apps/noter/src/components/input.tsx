import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";

export type InputProps = React.ComponentPropsWithoutRef<typeof BaseInput>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => <BaseInput ref={ref} {...props} />,
);

Input.displayName = "Input";
