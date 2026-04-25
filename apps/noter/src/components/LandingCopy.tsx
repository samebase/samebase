import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { landingPageMarkdown } from "@/lib/landingCopy";

export function LandingCopy({
  className,
  editable = false,
  markdown = landingPageMarkdown,
  onChange,
}: {
  className?: string;
  editable?: boolean;
  markdown?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <ProsemarkReadOnly
      value={markdown}
      className={className}
      editable={editable}
      onChange={onChange}
    />
  );
}
