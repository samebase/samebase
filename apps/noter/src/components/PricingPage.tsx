import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { useConvexAuth } from "convex/react";
import { Button } from "@/components/button";
import {
  PLAN_FEATURES,
  PUBLIC_PRIVATE_ACCESS_PRICE,
} from "@/lib/pricingContent";
import { PRIVATE_ACCESS_LIST_PATH } from "@/lib/publicPricing";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/card";
import { Badge } from "@/components/badge";

export function PricingPage() {
  const { isAuthenticated } = useConvexAuth();
  const privateAccessHref = isAuthenticated
    ? "/billing"
    : PRIVATE_ACCESS_LIST_PATH;
  const privateAccessCtaLabel = isAuthenticated
    ? "Open billing"
    : "Join private access list";
  const homeLabel = isAuthenticated ? "Back to app" : "Back home";

  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge variant="outline">Transparent pricing</Badge>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Free by default. Private code access is invite-first.
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                Start with Free. Private code access is currently
                {` ${PUBLIC_PRIVATE_ACCESS_PRICE} `}
                and handled through a transparent founder-led onboarding flow,
                not instant checkout.
              </p>
            </div>
            <div className="flex gap-2">
              {isAuthenticated ? (
                <Button variant="outline" asChild>
                  <Link to="/billing">Billing</Link>
                </Button>
              ) : null}
              <Button variant="outline" asChild>
                <Link to="/">{homeLabel}</Link>
              </Button>
            </div>
          </div>

          <div className="corner-notch-1 border border-border/70 bg-muted/20 px-4 py-4 text-sm">
            <p className="font-medium">Current status</p>
            <p className="mt-2 text-muted-foreground">
              Free is the default path. Private code access becomes
              {` ${PUBLIC_PRIVATE_ACCESS_PRICE} `}
              only after manual onboarding and GitHub org access approval. This
              page does not send anyone to checkout yet.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Free</h2>
                  <Badge variant="outline">Default</Badge>
                </div>
                <p className="text-3xl font-semibold tracking-tight">Free</p>
                <p className="text-sm text-muted-foreground">
                  The default self-serve entry point.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLAN_FEATURES.free.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline" asChild>
                  <Link to="/">Start free</Link>
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-primary/40">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Private Code Access</h2>
                  <Badge>Invite-first</Badge>
                </div>
                <p className="text-3xl font-semibold tracking-tight">
                  {PUBLIC_PRIVATE_ACCESS_PRICE}
                </p>
                <p className="text-sm text-muted-foreground">
                  Private access is currently invite-only while we validate
                  private-code workflows.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLAN_FEATURES.privateAccess.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
                <div className="rounded-ui border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                  We use a founder-led private onboarding flow before any GitHub
                  org invite. The current next step is milestone updates and
                  private access instructions.
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" asChild>
                  <Link to={privateAccessHref}>{privateAccessCtaLabel}</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
