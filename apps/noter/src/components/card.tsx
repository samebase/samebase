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
    const cardRef = useCornerNotchBridgeColor(cornerNotch, ref, className);

    return (
      <BaseCard
        ref={cardRef}
        className={cn(getOptionalCornerNotchClass(cornerNotch), className)}
        {...props}
      />
    );
  },
);

Card.displayName = "Card";

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
