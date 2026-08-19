import { TermsAcceptanceView } from "@/components/TermsAcceptanceGate";

export function TermsAcceptanceVisualFixture() {
  return <TermsAcceptanceView accepting={false} error={null} onAccept={() => {}} />;
}
