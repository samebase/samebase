import { TermsAcceptanceView } from "@/components/TermsAcceptanceGate";

export function TermsAcceptanceVisualFixture() {
  return (
    <TermsAcceptanceView
      error={null}
      onAccept={() => {}}
      onSignOut={() => {}}
      pendingAction={null}
    />
  );
}
