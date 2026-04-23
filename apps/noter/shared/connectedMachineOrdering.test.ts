import { describe, expect, it } from "vite-plus/test";
import {
  compareConnectedMachineSidebarOrder,
  readConnectedMachineSidebarOrder,
  type ConnectedMachineSidebarSortable,
} from "./connectedMachineOrdering";

function buildMachine(
  overrides: Partial<ConnectedMachineSidebarSortable> & {
    machineId: string;
  },
): ConnectedMachineSidebarSortable {
  const { machineId, ...rest } = overrides;

  return {
    _creationTime: 1_000,
    displayName: "Machine",
    machineId,
    sidebarOrder: undefined,
    ...rest,
  };
}

describe("connectedMachineOrdering", () => {
  it("falls back to the original row creation time when a machine has no saved sidebar order yet", () => {
    expect(
      readConnectedMachineSidebarOrder(
        buildMachine({
          _creationTime: 1_234,
          machineId: "machine-a",
        }),
      ),
    ).toBe(1_234);
  });

  it("prefers higher saved sidebar order values so newer machines stay first by default", () => {
    const orderedMachineIds = [
      buildMachine({
        machineId: "machine-older",
        displayName: "Older machine",
        sidebarOrder: 100,
      }),
      buildMachine({
        machineId: "machine-newer",
        displayName: "Newer machine",
        sidebarOrder: 200,
      }),
    ]
      .sort(compareConnectedMachineSidebarOrder)
      .map((machine) => machine.machineId);

    expect(orderedMachineIds).toEqual(["machine-newer", "machine-older"]);
  });

  it("sorts mixed legacy and persisted rows deterministically", () => {
    const orderedMachineIds = [
      buildMachine({
        machineId: "legacy-machine",
        displayName: "Legacy",
        _creationTime: 900,
      }),
      buildMachine({
        machineId: "persisted-machine",
        displayName: "Persisted",
        sidebarOrder: 1_100,
      }),
    ]
      .sort(compareConnectedMachineSidebarOrder)
      .map((machine) => machine.machineId);

    expect(orderedMachineIds).toEqual(["persisted-machine", "legacy-machine"]);
  });

  it("breaks exact order ties deterministically by display name and machine id", () => {
    const orderedMachineIds = [
      buildMachine({
        machineId: "machine-z",
        displayName: "Same",
        sidebarOrder: 100,
      }),
      buildMachine({
        machineId: "machine-a",
        displayName: "Same",
        sidebarOrder: 100,
      }),
      buildMachine({
        machineId: "machine-b",
        displayName: "Alpha",
        sidebarOrder: 100,
      }),
    ]
      .sort(compareConnectedMachineSidebarOrder)
      .map((machine) => machine.machineId);

    expect(orderedMachineIds).toEqual(["machine-b", "machine-a", "machine-z"]);
  });
});
