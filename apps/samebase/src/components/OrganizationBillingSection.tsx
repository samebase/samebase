import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { toast } from "@/components/ui/use-toast";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { ORGANIZATION_SETTINGS_ROUTE } from "@/lib/organizationRoutes";
import {
  CHECKOUT_QUERY_PARAM,
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
  type OrganizationBillingSearch,
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

const organizationSettingsRouteApi = getRouteApi(ORGANIZATION_SETTINGS_ROUTE);

type BillingRequestState = "idle" | "upgrade" | "downgrade" | "seat_add" | "seat_remove" | "portal";

const billingDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function readBillingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatConnectionUsage(usage: BillingResourceUsage["connections"]) {
  const used = usage.used.state === "at_least" ? `${usage.used.count}+` : usage.used.count;
  return `${used} of ${usage.limit}`;
}

export function OrganizationBillingSection({
  organization,
  search,
}: {
  organization: ViewerOrganization;
  search: OrganizationBillingSearch;
}) {
  const router = useRouter();
  const navigate = organizationSettingsRouteApi.useNavigate();
  const billingStatus = useQuery(api.billing.getViewerBillingStatus, {
    organizationId: organization.organizationId,
  });
  const billingUsage = useQuery(api.billingResourceQuotas.getViewerBillingResourceUsage, {
    organizationId: organization.organizationId,
  });
  const requestBillingChange = useAction(api.billing.requestPolarBillingChange);
  const createCustomerPortalSession = useAction(api.billing.createPolarCustomerPortalSession);
  const reconcileBilling = useAction(api.billing.reconcileViewerBillingFromPolar);
  const [billingRequestState, setBillingRequestState] = useState<BillingRequestState>("idle");
  const [billingReconciliationDelayed, setBillingReconciliationDelayed] = useState(false);
  const checkoutReturnState = search[CHECKOUT_QUERY_PARAM];
  const isPreview = readBrowserRouteEnvironment() === "preview";
  const isOrganizationOwner = organization.role === "owner";
  const canManageBilling = billingStatus?.canManageBilling ?? false;
  const billingActionsAvailable = canManageBilling && !isPreview;
  const hasTrustedSubscription = billingStatus?.hasSubscription ?? false;

  // A Back/Forward cache restore keeps the pending state from before the browser left for Polar.
  useEffect(() => {
    const resetRestoredBillingRequest = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setBillingRequestState("idle");
      }
    };

    window.addEventListener("pageshow", resetRestoredBillingRequest);
    return () => {
      window.removeEventListener("pageshow", resetRestoredBillingRequest);
    };
  }, []);

  useEffect(() => {
    if (checkoutReturnState !== "success") {
      setBillingReconciliationDelayed(false);
      return;
    }

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

    setBillingReconciliationDelayed(false);
    if (!isOrganizationOwner) {
      clearCheckoutReturn();
      return;
    }
    if (!billingActionsAvailable) {
      return;
    }
    if (hasTrustedSubscription) {
      clearCheckoutReturn();
      return;
    }

    let active = true;
    void reconcileBilling({ organizationId: organization.organizationId })
      .then((reconciled) => {
        if (!active) {
          return;
        }
        if (reconciled.state === "observed" && reconciled.hasSubscription) {
          clearCheckoutReturn();
        } else {
          setBillingReconciliationDelayed(true);
        }
      })
      .catch(() => {
        if (active) {
          setBillingReconciliationDelayed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [
    billingActionsAvailable,
    checkoutReturnState,
    hasTrustedSubscription,
    isOrganizationOwner,
    navigate,
    organization.organizationId,
    reconcileBilling,
  ]);

  if (billingStatus === undefined || billingUsage === undefined) {
    return null;
  }

  const buildBillingUrl = (checkout: "success" | "cancel" | null) => {
    const location = router.buildLocation({
      hash: "billing",
      params: { owner: organization.githubOwnerLogin.toLowerCase() },
      search: (currentSearch) =>
        applySearchPatch(currentSearch, {
          [CHECKOUT_QUERY_PARAM]: checkout,
          [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
        }),
      to: ORGANIZATION_SETTINGS_ROUTE,
    });
    return new URL(location.href, window.location.origin).toString();
  };

  const handleBillingChange = async (
    change: "upgrade_to_pro" | "downgrade_to_free" | "add_member_seat" | "remove_member_seat",
  ) => {
    if (!billingActionsAvailable || billingRequestState !== "idle") {
      return;
    }

    let requestState: BillingRequestState;
    if (change === "upgrade_to_pro") {
      requestState = "upgrade";
    } else if (change === "downgrade_to_free") {
      requestState = "downgrade";
    } else if (change === "add_member_seat") {
      requestState = "seat_add";
    } else {
      requestState = "seat_remove";
    }
    setBillingRequestState(requestState);
    try {
      const result = await requestBillingChange({
        organizationId: organization.organizationId,
        change,
        returnUrl: buildBillingUrl("cancel"),
        successUrl: buildBillingUrl("success"),
      });
      if (result.state === "checkout") {
        window.location.assign(result.url);
        return;
      }
      toast({
        title:
          change === "upgrade_to_pro"
            ? "Pro is active"
            : change === "downgrade_to_free"
              ? "Free is scheduled for the next billing period"
              : change === "remove_member_seat"
                ? "Unused member seat removed"
                : billingStatus.billingLimited
                  ? "Member access restored"
                  : "Member seat added",
      });
      setBillingRequestState("idle");
    } catch (error) {
      toast({
        description: readBillingErrorMessage(error, "Please try again."),
        title: "Could not update billing",
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

  const paidMemberCapacity = Math.max(
    0,
    billingStatus.memberCapacity - billingStatus.includedMembers,
  );
  const hasUnusedPaidMemberSeat =
    billingStatus.memberCapacity >
    Math.max(billingStatus.memberCount, billingStatus.includedMembers);
  const requestPending = billingRequestState !== "idle";

  return (
    <section
      aria-labelledby="organization-billing-heading"
      className="mt-8 border-t pt-6"
      data-testid="organization-billing-section"
      id="billing"
    >
      <h2 id="organization-billing-heading" className="text-base font-semibold">
        Billing
      </h2>
      <dl className="mt-4 space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Current plan</dt>
          <dd className="text-sm text-muted-foreground">
            {billingStatus.plan === "pro" ? "Pro" : "Free"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Connections</dt>
          <dd className="text-sm text-muted-foreground">
            {formatConnectionUsage(billingUsage.connections)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Members</dt>
          <dd className="text-sm text-muted-foreground">
            {billingStatus.memberCount} of {billingStatus.memberCapacity}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Included members</dt>
          <dd className="text-sm text-muted-foreground">{billingStatus.includedMembers}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Paid member seats</dt>
          <dd className="text-sm text-muted-foreground">{paidMemberCapacity}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm font-medium">Billing payer</dt>
          <dd className="text-sm text-muted-foreground">
            {billingStatus.payerState === "viewer"
              ? "You"
              : billingStatus.payerState === "another_owner"
                ? "Another owner"
                : "Not assigned"}
          </dd>
        </div>
        {billingStatus.cancelAtPeriodEnd ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm font-medium">Next plan</dt>
            <dd className="text-sm text-muted-foreground">Free</dd>
          </div>
        ) : null}
        {billingStatus.hasSubscription && billingStatus.currentPeriodEndAt !== undefined ? (
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

      {billingStatus.billingLimited ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Add paid member capacity or remove members to restore organization access.
        </p>
      ) : billingStatus.status === "past_due" ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Payment needs attention. Open the billing portal to update the payment method.
        </p>
      ) : billingStatus.payerState === "another_owner" && isOrganizationOwner ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Another owner manages billing for this organization.
        </p>
      ) : checkoutReturnState === "cancel" ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Checkout canceled. Billing did not change.
        </p>
      ) : checkoutReturnState === "success" ? (
        billingActionsAvailable ? (
          billingStatus.hasSubscription ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Billing is active.
            </p>
          ) : billingReconciliationDelayed ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Payment confirmation is delayed. Refresh this page to check again.
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Checking your payment...
            </p>
          )
        ) : isOrganizationOwner && isPreview ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            Checkout confirmation is disabled in this preview.
          </p>
        ) : null
      ) : null}

      {isOrganizationOwner && canManageBilling ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {billingStatus.plan === "free" ? (
            <Button
              disabled={!billingActionsAvailable || requestPending}
              onClick={() => void handleBillingChange("upgrade_to_pro")}
              type="button"
            >
              {billingRequestState === "upgrade" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {billingRequestState === "upgrade" ? "Updating..." : "Upgrade to Pro, $4/month"}
            </Button>
          ) : null}
          {billingStatus.plan === "pro" && !billingStatus.cancelAtPeriodEnd ? (
            <Button
              disabled={!billingActionsAvailable || requestPending}
              onClick={() => void handleBillingChange("downgrade_to_free")}
              type="button"
              variant="outline"
            >
              {billingRequestState === "downgrade" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {billingRequestState === "downgrade"
                ? "Updating..."
                : "Switch to Free next billing period"}
            </Button>
          ) : null}
          {billingStatus.plan === "pro" && !billingStatus.cancelAtPeriodEnd ? (
            <ButtonGroup aria-label="Member seat actions">
              <Button
                disabled={!billingActionsAvailable || requestPending}
                onClick={() => void handleBillingChange("add_member_seat")}
                type="button"
                variant="outline"
              >
                {billingRequestState === "seat_add" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {billingRequestState === "seat_add"
                  ? "Updating..."
                  : billingStatus.billingLimited
                    ? "Restore member access"
                    : "Add member seat, $2/month"}
              </Button>
              <Button
                disabled={!billingActionsAvailable || requestPending || !hasUnusedPaidMemberSeat}
                onClick={() => void handleBillingChange("remove_member_seat")}
                type="button"
                variant="outline"
              >
                {billingRequestState === "seat_remove" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {billingRequestState === "seat_remove" ? "Updating..." : "Remove unused seat"}
              </Button>
            </ButtonGroup>
          ) : null}
          {billingStatus.hasSubscription ? (
            <Button
              disabled={!billingActionsAvailable || requestPending}
              onClick={() => void handleManageSubscription()}
              type="button"
              variant="outline"
            >
              {billingRequestState === "portal" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {billingRequestState === "portal" ? "Opening..." : "Manage subscription"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
