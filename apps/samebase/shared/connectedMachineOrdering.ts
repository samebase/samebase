export type ConnectedMachineSidebarSortable = {
  _creationTime: number;
  displayName: string;
  machineId: string;
  sidebarOrder?: number;
};

/**
 * Persist explicit machine order when available, but keep older rows stable by
 * falling back to the original row creation time instead of live heartbeats.
 */
export function readConnectedMachineSidebarOrder(machine: ConnectedMachineSidebarSortable): number {
  return machine.sidebarOrder ?? machine._creationTime;
}

/**
 * Sort by the effective order from `readConnectedMachineSidebarOrder()`, then
 * break ties by `displayName` and `machineId` so every call site stays stable.
 */
export function compareConnectedMachineSidebarOrder(
  left: ConnectedMachineSidebarSortable,
  right: ConnectedMachineSidebarSortable,
): number {
  const leftOrder = readConnectedMachineSidebarOrder(left);
  const rightOrder = readConnectedMachineSidebarOrder(right);
  if (leftOrder !== rightOrder) {
    return rightOrder - leftOrder;
  }

  const displayNameComparison = left.displayName.localeCompare(right.displayName);
  if (displayNameComparison !== 0) {
    return displayNameComparison;
  }

  return left.machineId.localeCompare(right.machineId);
}
