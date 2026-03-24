import { StaticMarkdownDocument } from "@/components/StaticMarkdownDocument";
import termsOfServiceMarkdown from "../content/terms-of-service.md?raw";

export function TermsOfServicePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-8">
        <div className="mx-auto max-w-3xl pb-8">
          <StaticMarkdownDocument value={termsOfServiceMarkdown} />
        </div>
      </div>
    </div>
  );
}
