import { clsx } from "clsx";
import { linkStyle } from "../../components/styles";

export function PullRequestLink({
  pullRequestNumber,
  pullRequestUrl,
  className,
}: {
  pullRequestNumber?: number;
  pullRequestUrl: string;
  className?: string;
}) {
  const pullRequestLabel = typeof pullRequestNumber === "number" ? `#${pullRequestNumber}` : "PR";

  return (
    <a
      href={pullRequestUrl}
      target="_blank"
      rel="noreferrer noopener"
      className={clsx("font-mono", linkStyle, className)}
      title="Open pull request"
    >
      {pullRequestLabel}
    </a>
  );
}
