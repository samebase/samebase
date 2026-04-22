import * as React from "react";
import {
  Card as BaseCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type CornerNotchType } from "@/lib/cornerNotch";

export interface CardProps extends React.ComponentPropsWithoutRef<
  typeof BaseCard
> {
  // Keep the prop temporarily so existing callsites stay readable during the migration.
  cornerNotch?: CornerNotchType;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ cornerNotch: _cornerNotch, ...props }, ref) => (
    <BaseCard ref={ref} {...props} />
  ),
);

Card.displayName = "Card";

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
