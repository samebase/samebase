import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { landingPageMarkdown } from "@/lib/landingCopy";

export function LandingCopy({
  className,
  markdown = landingPageMarkdown,
}: {
  className?: string;
  markdown?: string;
}) {
  return <ProsemarkReadOnly value={markdown} className={className} />;
}
