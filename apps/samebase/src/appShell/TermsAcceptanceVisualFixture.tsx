import { TermsAcceptanceView } from "@/appShell/TermsAcceptanceGate";
import { useState } from "react";

export function TermsAcceptanceVisualFixture() {
  const [termsAccepted, setTermsAccepted] = useState(false);

  return (
    <TermsAcceptanceView
      accepting={false}
      error={null}
      onAccept={() => {}}
      onProductUpdateEmailsChange={() => {}}
      onTermsAcceptedChange={setTermsAccepted}
      productUpdateEmails={false}
      termsAccepted={termsAccepted}
    />
  );
}
