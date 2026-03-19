import * as React from "react";
import {
  Card as BaseCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DEFAULT_CORNER_NOTCH_TYPE,
  getOptionalCornerNotchClass,
  type CornerNotchType,
} from "@/lib/cornerNotch";
import { useCornerNotchBridgeColor } from "@/hooks/useCornerNotchBridgeColor";
import { cn } from "@/lib/utils";

export interface CardProps
  extends React.ComponentPropsWithoutRef<typeof BaseCard> {
  cornerNotch?: CornerNotchType;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, cornerNotch, ...props }, ref) => {
    const resolvedCornerNotch = cornerNotch ?? DEFAULT_CORNER_NOTCH_TYPE;
    const cardRef = useCornerNotchBridgeColor(
      resolvedCornerNotch,
      ref,
      className,
    );

    return (
      <BaseCard
        ref={cardRef}
        className={cn(
          getOptionalCornerNotchClass(resolvedCornerNotch),
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = "Card";

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
