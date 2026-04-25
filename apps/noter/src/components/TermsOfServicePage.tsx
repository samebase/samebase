import { LegalMarkdownPage } from "@/components/LegalMarkdownPage";
import termsOfServiceMarkdown from "../content/terms-of-service.md?raw";

export function TermsOfServicePage() {
  return <LegalMarkdownPage value={termsOfServiceMarkdown} />;
}
