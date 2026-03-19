import type { BillingCycle } from "../../convex/dashboardSettings";

export type PaidPlan = "pro" | "team";

export const PUBLIC_PRIVATE_ACCESS_PRICE = "$4.99/month";

export const PLAN_DISPLAY_PRICE: Record<
  PaidPlan,
  Record<BillingCycle, string>
> = {
  pro: {
    monthly: "$20/mo",
    annual: "$200/yr",
  },
  team: {
    monthly: "Coming soon",
    annual: "Coming soon",
  },
};

export const PLAN_FEATURES = {
  free: [
    "Try Noter before granting any private repo access.",
    "No intro call required for Free.",
    "Best for exploring and planning milestone progress.",
  ],
  privateAccess: [
    "Invite-only for now, while we validate direct private-code work.",
    "Sign up for milestone updates and private access instructions.",
    "Noter can inspect private code only after founder confirmation.",
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
