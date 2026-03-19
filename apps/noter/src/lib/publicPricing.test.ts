import { describe, expect, it } from "vitest";

import {
  PRIVATE_ACCESS_LIST_PATH,
  isPrivateAccessLanding,
  resolveLandingWaitlistContent,
} from "./publicPricing";

describe("publicPricing", () => {
  it("uses an exact milestone-updates intake path", () => {
    expect(PRIVATE_ACCESS_LIST_PATH).toBe("/?milestones");
  });

  it("detects the private-access landing variant from the query flag", () => {
    expect(isPrivateAccessLanding("?milestones")).toBe(true);
    expect(isPrivateAccessLanding("")).toBe(false);
  });

  it("switches waitlist copy for the private-access landing variant", () => {
    expect(resolveLandingWaitlistContent("?milestones")).toEqual({
      heading: "Private access list",
      description:
        "Leave your email for milestone updates and private access instructions. No checkout yet.",
      submitLabel: "Get milestone updates",
      submittedMessage:
        "You're on the list. We'll email milestones and private access instructions.",
    });

    expect(resolveLandingWaitlistContent("")).toEqual({
      heading: null,
      description: null,
      submitLabel: "Join Waitlist",
      submittedMessage:
        "You're on the waitlist. We'll reach out when a spot opens up.",
    });
  });
});
