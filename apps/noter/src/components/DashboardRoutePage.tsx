import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

async function loadVaultDashboard() {
  const module = await import("@/components/vault-dashboard/VaultDashboard");
  return { default: module.VaultDashboard };
}

const VaultDashboard = lazy(loadVaultDashboard);

/**
 * Keep the dashboard behind the existing authenticated app shell on its
 * canonical route.
 */
export function DashboardRoutePage() {
  return (
    <AuthenticatedAppRoutePage>
      <VaultDashboard />
    </AuthenticatedAppRoutePage>
  );
}
