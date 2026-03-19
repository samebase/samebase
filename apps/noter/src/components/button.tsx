import * as React from "react";
import {
  Button as BaseButton,
  type ButtonProps as BaseButtonProps,
} from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ButtonProps = BaseButtonProps;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <BaseButton ref={ref} className={cn(className)} {...props} />
  ),
);

Button.displayName = "Button";
