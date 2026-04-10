import { StaticMarkdownDocument } from "@/components/StaticMarkdownDocument";
import privacyPolicyMarkdown from "../content/privacy-policy.md?raw";

export function PrivacyPolicyPage() {
  return (
    <div>
      <div className="container py-8">
        <div className="mx-auto max-w-3xl pb-8">
          <StaticMarkdownDocument value={privacyPolicyMarkdown} />
        </div>
      </div>
    </div>
  );
}
