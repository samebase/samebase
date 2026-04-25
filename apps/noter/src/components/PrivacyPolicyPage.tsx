import { LegalMarkdownPage } from "@/components/LegalMarkdownPage";
import privacyPolicyMarkdown from "../content/privacy-policy.md?raw";

export function PrivacyPolicyPage() {
  return <LegalMarkdownPage value={privacyPolicyMarkdown} />;
}
