import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/vault-dashboard/VaultDashboard");
  return { default: module.VaultDashboard };
});

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
