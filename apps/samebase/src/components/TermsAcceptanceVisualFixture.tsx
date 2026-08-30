import { TermsAcceptanceView } from "@/components/TermsAcceptanceGate";

export function TermsAcceptanceVisualFixture() {
  return (
    <TermsAcceptanceView
      accepting={false}
      error={null}
      onAccept={() => {}}
      onProductUpdateEmailsChange={() => {}}
      onTermsAcceptedChange={() => {}}
      productUpdateEmails={false}
      termsAccepted={false}
    />
  );
}
