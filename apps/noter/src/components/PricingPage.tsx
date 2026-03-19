import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { BillingCycle } from "../../convex/dashboardSettings";
import { Button } from "@/components/ui/button";
import { PLAN_DISPLAY_PRICE, PLAN_FEATURES } from "@/lib/pricingContent";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";

function readCheckoutState(): "success" | "cancel" | null {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("checkout");
  return raw === "success" || raw === "cancel" ? raw : null;
}

export function PricingPage() {
  const billingStatus = useQuery(api.billing.getViewerBillingStatus);
  const dashboardSettings = useQuery(
    api.dashboardSettings.getDashboardSettings,
  );
  const setPricingBillingCycle = useMutation(
    api.dashboardSettings.setPricingBillingCycle,
  );
  const createCheckoutSession = useAction(
    api.billing.createPolarCheckoutSession,
  );
  const createPortalSession = useAction(
    api.billing.createPolarCustomerPortalSession,
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<
    "checkout" | "portal" | null
  >(null);

  const billingCycle: BillingCycle =
    dashboardSettings?.pricingBillingCycle ?? "monthly";

  const checkoutState = useMemo(() => readCheckoutState(), []);
  const displayPrices = useMemo(
    () => ({
      pro: PLAN_DISPLAY_PRICE.pro[billingCycle],
      team: PLAN_DISPLAY_PRICE.team[billingCycle],
    }),
    [billingCycle],
  );

  const isPro =
    billingStatus?.plan === "pro" && billingStatus.status === "active";

  useEffect(() => {
    if (checkoutState === "success") {
      setCheckoutError(null);
    }
    if (checkoutState === "cancel") {
      setCheckoutError("Checkout canceled.");
    }
  }, [checkoutState]);

  const handleStartPro = async () => {
    setCheckoutError(null);
    setPendingIntent("checkout");

    try {
      const origin = window.location.origin;
      const successUrl = new URL(
        "/pricing?checkout=success",
        origin,
      ).toString();
      const returnUrl = new URL("/pricing?checkout=cancel", origin).toString();
      const result = await createCheckoutSession({
        interval: billingCycle,
        successUrl,
        returnUrl,
      });
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Unable to start checkout.",
      );
      setPendingIntent(null);
    }
  };

  const handleManageSubscription = async () => {
    setCheckoutError(null);
    setPendingIntent("portal");

    try {
      const origin = window.location.origin;
      const returnUrl = new URL("/pricing", origin).toString();
      const result = await createPortalSession({ returnUrl });
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Unable to open the customer portal.",
      );
      setPendingIntent(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold sm:text-3xl">Pricing</h1>
                {isPro && <Badge>Pro active</Badge>}
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">Back to Vaults</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ToggleGroup
              type="single"
              value={billingCycle}
              onValueChange={(value) => {
                if (value === "monthly" || value === "annual") {
                  void setPricingBillingCycle({ billingCycle: value });
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

          {checkoutError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {checkoutError}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Free</h2>
                  <Badge variant="outline">$0</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Fully self-serve and BYO infrastructure.
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
                  <Link to="/">Use Free Plan</Link>
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
                  Simple subscription now, credits-ready as metering matures.
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
                <Button
                  className="w-full"
                  disabled={
                    pendingIntent !== null ||
                    (billingCycle === "annual" &&
                      displayPrices.pro === "Coming soon")
                  }
                  onClick={() => {
                    if (isPro) {
                      void handleManageSubscription();
                      return;
                    }
                    void handleStartPro();
                  }}
                >
                  {pendingIntent === "checkout" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redirecting...
                    </>
                  ) : pendingIntent === "portal" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening portal...
                    </>
                  ) : isPro ? (
                    "Manage subscription"
                  ) : (
                    "Start Pro"
                  )}
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
                  Shared billing and collaboration controls are next.
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
                  Team will open soon
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
