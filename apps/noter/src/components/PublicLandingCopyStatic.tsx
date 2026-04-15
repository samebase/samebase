import {
  landingPageBullets,
  landingPageMarkdown,
  landingPageSlogan,
  parseLandingCopyMarkdown,
} from "@/lib/landingCopy";

export function PublicLandingCopyStatic({
  markdown = landingPageMarkdown,
}: {
  markdown?: string;
}) {
  const { bullets, slogan } =
    markdown === landingPageMarkdown
      ? { bullets: [...landingPageBullets], slogan: landingPageSlogan }
      : parseLandingCopyMarkdown(markdown);

  return (
    <div className="text-sm leading-5">
      {slogan.length > 0 ? (
        <h2 className="text-lg font-medium leading-7 tracking-tight text-primary">
          {slogan}
        </h2>
      ) : null}
      {bullets.length > 0 ? (
        <ul className="mt-[9px] space-y-2 text-muted-foreground">
          {bullets.map((bullet, index) => (
            <li key={`${index}:${bullet}`} className="flex gap-1">
              <span aria-hidden="true" className="shrink-0 text-foreground">
                -
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
