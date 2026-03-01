import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { initializePaddleClient } from "@/lib/paddleClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";

type BillingCycle = "monthly" | "annual";
type PaidPlan = "pro" | "team";

const BILLING_INTERVAL_LABEL: Record<BillingCycle, string> = {
  monthly: "Monthly",
  annual: "Annual",
};

const PLAN_FALLBACK_PRICE: Record<PaidPlan, Record<BillingCycle, string>> = {
  pro: {
    monthly: "$20/mo",
    annual: "$200/yr",
  },
  team: {
    monthly: "Coming soon",
    annual: "Coming soon",
  },
};

const PLAN_FEATURES = {
  free: [
    "Use your own GitHub, Convex, and Railway accounts",
    "Bring your own AI usage and provider costs",
    "No Noter-hosted agent compute included",
  ],
  pro: [
    "Managed Noter experience",
    "Priority for paid billing features",
    "Credits-ready path when usage metering ships",
  ],
  team: [
    "Shared credits and workspace controls",
    "Centralized team billing",
    "Planned for a later phase",
  ],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return typeof current === "string" && current.trim().length > 0
    ? current
    : undefined;
}

function extractFormattedTotal(preview: unknown): string | null {
  const knownPaths = [
    ["data", "details", "totals", "total"],
    ["data", "details", "totals", "formattedTotal"],
    ["data", "details", "lineItems", "0", "totals", "total"],
    ["data", "details", "lineItems", "0", "formattedTotals", "total"],
    ["details", "totals", "total"],
    ["details", "formattedTotals", "total"],
  ];

  for (const path of knownPaths) {
    const value = readNestedString(preview, path);
    if (value) {
      return value;
    }
  }

  return null;
}

export function PricingPage() {
  const viewer = useQuery(api.users.viewer);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [displayPrices, setDisplayPrices] = useState<Record<PaidPlan, string>>({
    pro: PLAN_FALLBACK_PRICE.pro.monthly,
    team: PLAN_FALLBACK_PRICE.team.monthly,
  });
  const [pricePreviewError, setPricePreviewError] = useState<string | null>(
    null,
  );
  const [isPreviewingPrices, setIsPreviewingPrices] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPendingPlan, setCheckoutPendingPlan] =
    useState<PaidPlan | null>(null);

  const paddleEnvironment = useMemo<"sandbox" | "live">(() => {
    return import.meta.env.VITE_PADDLE_ENV === "live" ? "live" : "sandbox";
  }, []);
  const isSandbox = paddleEnvironment === "sandbox";
  const paddleClientToken =
    import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim() ?? "";
  const priceIds = useMemo(
    () => ({
      pro: {
        monthly: import.meta.env.VITE_PADDLE_PRICE_PRO_MONTHLY?.trim() ?? "",
        annual: import.meta.env.VITE_PADDLE_PRICE_PRO_ANNUAL?.trim() ?? "",
      },
      team: {
        monthly: import.meta.env.VITE_PADDLE_PRICE_TEAM_MONTHLY?.trim() ?? "",
        annual: import.meta.env.VITE_PADDLE_PRICE_TEAM_ANNUAL?.trim() ?? "",
      },
    }),
    [],
  );

  useEffect(() => {
    setDisplayPrices({
      pro: PLAN_FALLBACK_PRICE.pro[billingCycle],
      team: PLAN_FALLBACK_PRICE.team[billingCycle],
    });

    if (!paddleClientToken || !priceIds.pro[billingCycle]) {
      return;
    }

    let isActive = true;
    setIsPreviewingPrices(true);
    setPricePreviewError(null);

    const loadPrices = async () => {
      const paddle = await initializePaddleClient({
        environment: paddleEnvironment,
        clientToken: paddleClientToken,
        eventCallback: (event) => {
          if (isSandbox) {
            console.info("paddle:sandbox:event", event);
          }
        },
      });
      if (!paddle) {
        if (isActive) {
          setPricePreviewError("Paddle.js failed to load.");
        }
        return;
      }

      try {
        const proPreview = await paddle.PricePreview({
          items: [{ priceId: priceIds.pro[billingCycle], quantity: 1 }],
        });
        const nextProPrice =
          extractFormattedTotal(proPreview) ??
          PLAN_FALLBACK_PRICE.pro[billingCycle];

        let nextTeamPrice = PLAN_FALLBACK_PRICE.team[billingCycle];
        const teamPriceId = priceIds.team[billingCycle];
        if (teamPriceId) {
          const teamPreview = await paddle.PricePreview({
            items: [{ priceId: teamPriceId, quantity: 1 }],
          });
          nextTeamPrice = extractFormattedTotal(teamPreview) ?? nextTeamPrice;
        }

        if (isActive) {
          setDisplayPrices({
            pro: nextProPrice,
            team: nextTeamPrice,
          });
        }
      } catch (error) {
        if (isActive) {
          setPricePreviewError(
            error instanceof Error
              ? error.message
              : "Unable to preview localized prices.",
          );
        }
      } finally {
        if (isActive) {
          setIsPreviewingPrices(false);
        }
      }
    };

    void loadPrices();

    return () => {
      isActive = false;
    };
  }, [
    billingCycle,
    isSandbox,
    paddleClientToken,
    paddleEnvironment,
    priceIds.pro,
    priceIds.team,
  ]);

  const handleCheckout = async (plan: PaidPlan) => {
    const selectedPriceId = priceIds[plan][billingCycle];
    if (!selectedPriceId) {
      setCheckoutError(`${plan.toUpperCase()} checkout is not configured yet.`);
      return;
    }
    if (!paddleClientToken) {
      setCheckoutError("Missing Paddle client token.");
      return;
    }

    setCheckoutError(null);
    setCheckoutPendingPlan(plan);

    try {
      const paddle = await initializePaddleClient({
        environment: paddleEnvironment,
        clientToken: paddleClientToken,
        eventCallback: (event) => {
          if (isSandbox) {
            console.info("paddle:sandbox:event", event);
          }
        },
      });
      if (!paddle) {
        throw new Error("Paddle.js failed to initialize.");
      }

      await paddle.Checkout.open({
        items: [{ priceId: selectedPriceId, quantity: 1 }],
        customer: viewer?.email ? { email: viewer.email } : undefined,
        customData: {
          noterUserId: viewer?._id ?? "unknown",
          plan,
          billingCycle,
          source: "pricing_page",
        },
        settings: {
          displayMode: "overlay",
        },
      });
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Unable to open checkout.",
      );
    } finally {
      setCheckoutPendingPlan(null);
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
                <Badge variant={isSandbox ? "secondary" : "outline"}>
                  {isSandbox ? "Sandbox billing" : "Live billing"}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Start free with your own providers. Upgrade to Pro when you want
                managed billing and the paid Noter experience.
              </p>
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
            <p className="text-xs text-muted-foreground">
              Displaying {BILLING_INTERVAL_LABEL[billingCycle].toLowerCase()}{" "}
              plan prices.
            </p>
          </div>

          {pricePreviewError && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              {pricePreviewError}
            </div>
          )}
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
                  onClick={() => {
                    void handleCheckout("pro");
                  }}
                  disabled={
                    checkoutPendingPlan !== null ||
                    isPreviewingPrices ||
                    !priceIds.pro[billingCycle]
                  }
                >
                  {checkoutPendingPlan === "pro" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening checkout...
                    </>
                  ) : isSandbox ? (
                    "Start Pro in Sandbox"
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

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                Transparent usage roadmap
              </h2>
              <p className="text-sm text-muted-foreground">
                Pro starts as a simple subscription. Next step is transparent
                credits based on real measured token and compute usage.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                The long-term model is subscription plus clear credit accounting
                with a visible usage ledger.
              </p>
              <p>
                Checkout success does not grant entitlement by itself. Billing
                access updates only after webhook-confirmed subscription state.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
