import { StaticMarkdownDocument } from "@/components/StaticMarkdownDocument";

export function LegalMarkdownPage({ value }: { value: string }) {
  return (
    <div>
      <div className="container px-2 py-8">
        <div className="mx-auto max-w-3xl pb-8">
          <StaticMarkdownDocument value={value} />
        </div>
      </div>
    </div>
  );
}
