import type { ViewerOrganization } from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { ORGANIZATION_BILLING_ROUTE } from "@/lib/organizationRoutes";
import {
  CHECKOUT_QUERY_PARAM,
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
  type OrganizationBillingRouteSearch,
} from "@/routeSearch/organizationBilling";
import { readBrowserRouteEnvironment } from "@/routing/availability";
import { applySearchPatch } from "@/routing/searchFlags";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { BillingResourceUsage } from "../../convex/billingResourceQuotas";

const organizationBillingRouteApi = getRouteApi(ORGANIZATION_BILLING_ROUTE);

type BillingRequestState = "idle" | "checkout" | "portal";

const billingDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function readBillingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatBillingResourceUsage(usage: BillingResourceUsage["cloudflareWorkers"]) {
  const used = usage.used.state === "at_least" ? `${usage.used.count}+` : usage.used.count;
  return `${used} of ${usage.limit}`;
}

export function OrganizationBillingPage({
  organization,
  search,
}: {
  organization: ViewerOrganization;
  search: OrganizationBillingRouteSearch;
}) {
  const router = useRouter();
  const navigate = organizationBillingRouteApi.useNavigate();
  const billingStatus = useQuery(api.billing.getViewerBillingStatus, {
    organizationId: organization.organizationId,
  });
  const billingUsage = useQuery(api.billingResourceQuotas.getViewerBillingResourceUsage, {
    organizationId: organization.organizationId,
  });
  const createCheckoutSession = useAction(api.billing.createPolarCheckoutSession);
  const createCustomerPortalSession = useAction(api.billing.createPolarCustomerPortalSession);
  const reconcileBilling = useAction(api.billing.reconcileViewerBillingFromPolar);
  const [billingRequestState, setBillingRequestState] = useState<BillingRequestState>("idle");
  const [billingReconciliationDelayed, setBillingReconciliationDelayed] = useState(false);
  const checkoutReturnState = search[CHECKOUT_QUERY_PARAM];
  const canManageBilling = organization.role === "owner";
  const billingActionsAvailable = canManageBilling && readBrowserRouteEnvironment() !== "preview";
  const hasTrustedProBilling = billingStatus?.plan === "pro";

  useEffect(() => {
    if (checkoutReturnState !== "success" || !billingActionsAvailable) {
      setBillingReconciliationDelayed(false);
      return;
    }

    setBillingReconciliationDelayed(false);

    const clearCheckoutReturn = () => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (currentSearch) =>
          applySearchPatch(currentSearch, {
            [CHECKOUT_QUERY_PARAM]: null,
            [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
          }),
        to: ".",
      });
    };

    if (hasTrustedProBilling) {
      clearCheckoutReturn();
      return;
    }

    let active = true;
    const reconcileCheckoutReturn = async () => {
      try {
        const reconciled = await reconcileBilling({ organizationId: organization.organizationId });
        if (!active) {
          return;
        }
        if (reconciled.state === "observed" && reconciled.plan === "pro") {
          clearCheckoutReturn();
        } else {
          setBillingReconciliationDelayed(true);
        }
      } catch {
        if (active) {
          setBillingReconciliationDelayed(true);
        }
      }
    };

    void reconcileCheckoutReturn();

    return () => {
      active = false;
    };
  }, [
    billingActionsAvailable,
    checkoutReturnState,
    hasTrustedProBilling,
    navigate,
    organization.organizationId,
    reconcileBilling,
  ]);

  if (billingStatus === undefined || billingUsage === undefined) {
    return null;
  }

  const buildBillingUrl = (checkout: "success" | "cancel" | null) => {
    const location = router.buildLocation({
      params: { owner: organization.githubOwnerLogin.toLowerCase() },
      search: (currentSearch) =>
        applySearchPatch(currentSearch, {
          [CHECKOUT_QUERY_PARAM]: checkout,
          [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
        }),
      to: ORGANIZATION_BILLING_ROUTE,
    });
    return new URL(location.href, window.location.origin).toString();
  };

  const handleUpgrade = async () => {
    if (!billingActionsAvailable || billingRequestState !== "idle") {
      return;
    }

    setBillingRequestState("checkout");
    try {
      const session = await createCheckoutSession({
        organizationId: organization.organizationId,
        returnUrl: buildBillingUrl("cancel"),
        successUrl: buildBillingUrl("success"),
      });
      window.location.assign(session.url);
    } catch (error) {
      toast({
        description: readBillingErrorMessage(error, "Please try again."),
        title: "Could not open checkout",
        variant: "destructive",
      });
      setBillingRequestState("idle");
    }
  };

  const handleManageSubscription = async () => {
    if (!billingActionsAvailable || billingRequestState !== "idle") {
      return;
    }

    setBillingRequestState("portal");
    try {
      const session = await createCustomerPortalSession({
        organizationId: organization.organizationId,
        returnUrl: buildBillingUrl(null),
      });
      window.location.assign(session.url);
    } catch (error) {
      toast({
        description: readBillingErrorMessage(error, "Please try again."),
        title: "Could not open subscription settings",
        variant: "destructive",
      });
      setBillingRequestState("idle");
    }
  };

  return (
    <main
      data-testid="organization-billing-page"
      className="container mx-auto w-full max-w-2xl py-6"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Billing</h1>
      <dl className="mt-8 space-y-3 border-t pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Current plan</dt>
          <dd className="text-sm text-muted-foreground">
            {billingStatus.plan === "pro" ? "Pro" : "Free"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Cloudflare Workers</dt>
          <dd className="text-sm text-muted-foreground">
            {formatBillingResourceUsage(billingUsage.cloudflareWorkers)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Convex projects</dt>
          <dd className="text-sm text-muted-foreground">
            {formatBillingResourceUsage(billingUsage.convexProjects)}
          </dd>
        </div>
        {billingStatus.plan === "pro" && billingStatus.currentPeriodEndAt !== undefined ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm font-medium">
              {billingStatus.cancelAtPeriodEnd
                ? "Access ends"
                : billingStatus.status === "past_due"
                  ? "Billing period end"
                  : "Next billing date"}
            </dt>
            <dd className="text-sm text-muted-foreground">
              <time dateTime={new Date(billingStatus.currentPeriodEndAt).toISOString()}>
                {billingDateFormatter.format(billingStatus.currentPeriodEndAt)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>

      {billingStatus.status === "past_due" ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Payment needs attention. Manage your subscription to update the payment method.
        </p>
      ) : checkoutReturnState === "cancel" ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Checkout canceled. Your plan did not change.
        </p>
      ) : checkoutReturnState === "success" ? (
        billingActionsAvailable ? (
          billingStatus.plan === "pro" ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Your Pro plan is active.
            </p>
          ) : billingReconciliationDelayed ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Plan confirmation is delayed. Refresh this page to check again.
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Checking your payment and plan...
            </p>
          )
        ) : (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            Checkout confirmation is disabled in this preview.
          </p>
        )
      ) : null}

      {canManageBilling && (billingStatus.plan === "pro" || billingStatus.canStartCheckout) ? (
        <div className="mt-6">
          {billingStatus.plan === "pro" ? (
            <Button
              disabled={!billingActionsAvailable || billingRequestState !== "idle"}
              onClick={() => void handleManageSubscription()}
              type="button"
            >
              {billingRequestState === "portal" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {billingRequestState === "portal" ? "Opening..." : "Manage subscription"}
            </Button>
          ) : (
            <Button
              disabled={!billingActionsAvailable || billingRequestState !== "idle"}
              onClick={() => void handleUpgrade()}
              type="button"
            >
              {billingRequestState === "checkout" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {billingRequestState === "checkout" ? "Opening..." : "Upgrade to Pro, $4/month"}
            </Button>
          )}
        </div>
      ) : null}
    </main>
  );
}
