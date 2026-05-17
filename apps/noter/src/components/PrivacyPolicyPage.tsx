import { StaticMarkdownDocument } from "#src/components/StaticMarkdownDocument.tsx";
import privacyPolicyMarkdown from "../content/privacy-policy.md?raw";

export function PrivacyPolicyPage() {
  return (
    <div>
      <div className="container px-2 py-8">
        <div className="mx-auto max-w-3xl pb-8">
          <StaticMarkdownDocument value={privacyPolicyMarkdown} />
        </div>
      </div>
    </div>
  );
}
