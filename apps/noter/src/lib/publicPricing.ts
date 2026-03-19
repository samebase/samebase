import {
  buildPathWithUpdatedQuery,
  cloneQueryParams,
  setQueryParam,
} from "./queryParams";

const PRIVATE_ACCESS_QUERY_PARAM = "milestones";

export const PRIVATE_ACCESS_LIST_PATH = buildPathWithUpdatedQuery(
  { pathname: "/" },
  (searchParams) => {
    setQueryParam(searchParams, PRIVATE_ACCESS_QUERY_PARAM, true);
  },
);

type LandingWaitlistContent = {
  heading: string | null;
  description: string | null;
  submitLabel: string;
  submittedMessage: string;
};

const DEFAULT_LANDING_WAITLIST_CONTENT: LandingWaitlistContent = {
  heading: null,
  description: null,
  submitLabel: "Join Waitlist",
  submittedMessage:
    "You're on the waitlist. We'll reach out when a spot opens up.",
};

const PRIVATE_ACCESS_LANDING_WAITLIST_CONTENT: LandingWaitlistContent = {
  heading: "Private access list",
  description:
    "Leave your email for milestone updates and private access instructions. No checkout yet.",
  submitLabel: "Get milestone updates",
  submittedMessage:
    "You're on the list. We'll email milestones and private access instructions.",
};

export function isPrivateAccessLanding(
  search: string | URLSearchParams,
): boolean {
  return cloneQueryParams(search).has(PRIVATE_ACCESS_QUERY_PARAM);
}

export function resolveLandingWaitlistContent(
  search: string | URLSearchParams,
): LandingWaitlistContent {
  if (isPrivateAccessLanding(search)) {
    return PRIVATE_ACCESS_LANDING_WAITLIST_CONTENT;
  }

  return DEFAULT_LANDING_WAITLIST_CONTENT;
}

// TODO 2026-04-20: Replace the milestone-updates intake path with intro-call booking once that flow is live.
