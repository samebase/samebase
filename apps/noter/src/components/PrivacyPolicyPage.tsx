import { StaticMarkdownDocument } from "@/components/StaticMarkdownDocument";
import privacyPolicyMarkdown from "../content/privacy-policy.md?raw";

export function PrivacyPolicyPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-8">
        <div className="mx-auto max-w-3xl pb-8">
          <StaticMarkdownDocument value={privacyPolicyMarkdown} />
        </div>
      </div>
    </div>
  );
}
