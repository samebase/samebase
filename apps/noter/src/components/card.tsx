import * as React from "react";
import {
  Card as BaseCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#src/components/ui/card.tsx";

export type CardProps = React.ComponentPropsWithoutRef<typeof BaseCard>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (props, ref) => <BaseCard ref={ref} {...props} />,
);

Card.displayName = "Card";

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
