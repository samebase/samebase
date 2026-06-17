// Temporary branch note for codex/convex-access-inventory.
// Remove before merge unless these notes are promoted into durable guidance.

export const temporaryConvexAccessWrapperCleanupReason = [
  "dashboardSettings.ts showed avoidable validator ceremony that made public function definitions harder to read.",
  "The pattern is not specific to access policy, but each Convex file touched by the access-wrapper migration is a good place to remove it opportunistically.",
  "This should not go into AGENTS.md unless it proves to be a stable high-value rule; it is too detailed for always-loaded instructions right now.",
] as const;

export const temporaryConvexAccessWrapperCleanupRules = [
  "Inline args validators unless the validator is reused by multiple functions or needed by a helper outside the registration object.",
  "Let handler args infer from validators; do not add Infer<typeof FooArgs> only to annotate the handler parameter.",
  "Use returns: v.null() for no-result mutations/actions, but let the handler fall through instead of writing a final return null.",
  "Keep derived types when they model reusable domain shapes, such as BillingCycle or DashboardSettings.",
] as const;

export const temporaryConvexAccessWrapperCleanupCandidates = {
  "apps/noter/convex/agentGraphActions.ts": [
    "one-use sendAgentMessageArgs",
    "Infer<typeof sendAgentMessageArgs> handler annotation",
  ],
  "apps/noter/convex/agentGraphLayout.ts": [
    "one-use getNodeLayoutsArgs",
    "one-use setNodeLayoutArgs",
    "Infer<typeof ...Args> handler annotations",
    "setNodeLayoutReturns = vNull()",
  ],
  "apps/noter/convex/billing.ts": [
    "vPolarApplyStateArgs is a one-use args alias",
    "billing is currently assigned to access_admin and is not ready; handle carefully when we reach it",
  ],
  "apps/noter/convex/connectedMachines.ts": [
    "one-use listConnectedMachinesArgs",
    "one-use getMachineRegistrationRequestForBrowserArgs",
    "one-use approveMachineRegistrationRequestArgs",
    "Infer<typeof approveMachineRegistrationRequestArgs> handler annotation",
  ],
  "apps/noter/convex/devAuth.ts": [
    "one-use seedProviderConnectionsArgs",
    "Infer<typeof seedProviderConnectionsArgs> handler annotation",
  ],
  "apps/noter/convex/workspaceSidebarState.ts": [
    "one-use getWorkspaceSidebarStateArgs",
    "one-use setWorkspaceSidebarStateArgs",
    "Infer<typeof ...Args> handler annotations",
    "setWorkspaceSidebarStateReturns = vNull()",
  ],
} as const;

export const temporaryConvexAccessWrapperCleanupBroaderNote =
  "Many Convex files still have final return null statements in handlers with returns: v.null(). Do not bulk-remove them blindly. Clean them when already touching the file and when the final return null is not serving branch control.";
