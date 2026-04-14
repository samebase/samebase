import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { useCornerNotchStyling } from "@/hooks/useCornerNotchStyling";
import {
  DEFAULT_CORNER_NOTCH_FAMILY,
  DEFAULT_CORNER_NOTCH_TYPE,
  getCornerNotchClass,
  type CornerNotchFamily,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  cornerNotch?: CornerNotchType;
  cornerNotchFamily?: CornerNotchFamily;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      cornerNotch = DEFAULT_CORNER_NOTCH_TYPE,
      cornerNotchFamily = DEFAULT_CORNER_NOTCH_FAMILY,
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const finalClassName = cn(
      buttonVariants({ variant, size }),
      getCornerNotchClass(cornerNotch, cornerNotchFamily),
      cornerNotchFamily === "pixel" && "rounded-none",
      className,
    );
    const buttonRef = useCornerNotchStyling(
      cornerNotch,
      cornerNotchFamily,
      ref,
      finalClassName,
    );

    return <Comp className={finalClassName} ref={buttonRef} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
