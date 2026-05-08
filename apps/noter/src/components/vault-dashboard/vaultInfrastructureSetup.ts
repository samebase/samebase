export type VaultDashboardInfraState =
  | "not_started"
  | "provisioning"
  | "ready"
  | "failed"
  | "partial";

export type VaultInfrastructureSetupStatus =
  | {
      status: "running";
      label: string;
    }
  | {
      status: "failed";
      label: string;
      message: string;
    };

export function resolveVaultInfrastructureSetupStatus(
  infraState: VaultDashboardInfraState,
): VaultInfrastructureSetupStatus | null {
  switch (infraState) {
    case "not_started":
      return { status: "running", label: "Infra: preparing" };
    case "provisioning":
      return { status: "running", label: "Infra: provisioning" };
    case "failed":
      return {
        status: "failed",
        label: "Infra: failed",
        message: "Infra setup failed.",
      };
    case "partial":
      return {
        status: "failed",
        label: "Infra: partially complete",
        message: "Infra setup did not fully complete.",
      };
    case "ready":
      return null;
  }

  infraState satisfies never;
  return null;
}
