import { describe, expect, it } from "vite-plus/test";

import { machineHeartbeatHasConsistentLiveControlState } from "./connectedMachineHttp";

describe("machineHeartbeatHasConsistentLiveControlState", () => {
  it('requires the "liveControl" capability before publishing ready control state', () => {
    expect(
      machineHeartbeatHasConsistentLiveControlState({
        capabilities: ["presence"],
        controlStatus: "ready",
      }),
    ).toBe(false);
    expect(
      machineHeartbeatHasConsistentLiveControlState({
        capabilities: ["presence", "liveControl"],
        controlStatus: "ready",
      }),
    ).toBe(true);
  });

  it("allows non-ready control states without the live-control capability", () => {
    expect(
      machineHeartbeatHasConsistentLiveControlState({
        capabilities: ["presence"],
        controlStatus: "starting",
      }),
    ).toBe(true);
    expect(
      machineHeartbeatHasConsistentLiveControlState({
        capabilities: ["presence"],
        controlStatus: undefined,
      }),
    ).toBe(true);
  });
});
