/**
 * Daytona is intentionally paused while Noter shifts focus to local-machine
 * Codex integration. Keep the switch centralized so backend scheduling and UI
 * surfaces can agree on the same temporary product boundary.
 */
function resolveDaytonaPauseState(): boolean {
  return true;
}

export const DAYTONA_PAUSED = resolveDaytonaPauseState();

export const DAYTONA_PAUSED_MESSAGE =
  "Daytona is paused while Noter focuses on local-machine Codex.";
