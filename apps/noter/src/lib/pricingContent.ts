import type { BillingCycle } from "../../convex/dashboardSettings";

export type PaidPlan = "pro" | "team";

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
    "Use your own GitHub, Convex, Netlify, and Cloudflare accounts",
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
