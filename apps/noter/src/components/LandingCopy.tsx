import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import {
  landingPageBullets,
  landingPageMarkdown,
  landingPageSlogan,
  parseLandingCopyMarkdown,
} from "@/lib/landingCopy";

export function LandingCopy({
  className,
  markdown = landingPageMarkdown,
}: {
  className?: string;
  markdown?: string;
}) {
  const { bullets, slogan } =
    markdown === landingPageMarkdown
      ? { bullets: [...landingPageBullets], slogan: landingPageSlogan }
      : parseLandingCopyMarkdown(markdown);

  return (
    <div className="relative">
      <div className="sr-only">
        {slogan.length > 0 ? <h1>{slogan}</h1> : null}
        {bullets.length > 0 ? (
          <ul>
            {bullets.map((bullet, index) => (
              <li key={`${index}:${bullet}`}>{bullet}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div aria-hidden="true">
        <ProsemarkReadOnly
          value={markdown}
          className={className}
          styleVariant="landingCopy"
        />
      </div>
    </div>
  );
}
