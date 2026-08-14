import type { ErrorComponentProps } from "@tanstack/react-router";
import { isLikelyStaleAssetError } from "@/lib/appBootRecovery";

export function AppRouteErrorPage({ error }: ErrorComponentProps) {
  if (isLikelyStaleAssetError(error)) {
    throw error;
  }

  return (
    <main className="container mx-auto w-full max-w-2xl py-6" role="alert">
      <h1 className="text-xl font-semibold @2xl:text-2xl">Page could not load</h1>
    </main>
  );
}
