import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { BillingCycle } from "../../convex/dashboardSettings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import {
  PLAN_DISPLAY_PRICE,
  PLAN_FEATURES,
  type PaidPlan,
} from "@/lib/pricingContent";

export function PublicPricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  const displayPrices = useMemo(
    () => ({
      pro: PLAN_DISPLAY_PRICE.pro[billingCycle],
      team: PLAN_DISPLAY_PRICE.team[billingCycle],
    }),
    [billingCycle],
  );

  const waitlistCtaByPlan: Record<"free" | PaidPlan, string> = {
    free: "Join waitlist",
    pro: "Join waitlist",
    team: "Team will open soon",
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold sm:text-3xl">Pricing</h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Start with your own infrastructure or join the waitlist for the
                managed Noter experience.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">Back to Home</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Current access is invite-only.
            </div>
            <ToggleGroup
              type="single"
              value={billingCycle}
              onValueChange={(value) => {
                if (value === "monthly" || value === "annual") {
                  setBillingCycle(value);
                }
              }}
            >
              <ToggleGroupItem value="monthly" aria-label="Monthly billing">
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem value="annual" aria-label="Annual billing">
                Annual
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Free</h2>
                  <Badge variant="outline">$0</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Self-serve and bring your own infrastructure.
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
                  <Link to="/">{waitlistCtaByPlan.free}</Link>
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-primary/40">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Pro</h2>
                  <Badge>Recommended</Badge>
                </div>
                <p className="text-3xl font-semibold tracking-tight">
                  {displayPrices.pro}
                </p>
                <p className="text-sm text-muted-foreground">
                  Managed Noter experience for teams moving faster with AI
                  agents.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLAN_FEATURES.pro.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </CardContent>
              <CardFooter>
                <Button className="w-full" asChild>
                  <Link to="/">{waitlistCtaByPlan.pro}</Link>
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Team</h2>
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
                <p className="text-3xl font-semibold tracking-tight">
                  {displayPrices.team}
                </p>
                <p className="text-sm text-muted-foreground">
                  Shared billing and collaboration controls are planned next.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLAN_FEATURES.team.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline" disabled>
                  {waitlistCtaByPlan.team}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
