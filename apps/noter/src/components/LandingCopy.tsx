import {
  landingPageBullets,
  landingPageMarkdown,
  landingPageSlogan,
  parseLandingCopyMarkdown,
} from "@/lib/landingCopy";
import { cn } from "@/lib/utils";

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
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h1 className="text-pretty text-lg font-medium tracking-tight">
          {slogan}
        </h1>
      </div>
      <ul className="space-y-2 text-muted-foreground">
        {bullets.map((bullet, index) => (
          <li key={`${index}:${bullet}`} className="flex gap-2">
            <span aria-hidden="true" className="text-foreground">
              -
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
