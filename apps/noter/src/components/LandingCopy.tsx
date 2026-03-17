import { landingPageBullets, landingPageSlogan } from "@/lib/landingCopy";
import { cn } from "@/lib/utils";

export function LandingCopy({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h1 className="text-pretty text-lg font-medium tracking-tight">
          {landingPageSlogan}
        </h1>
      </div>
      <ul className="space-y-2 text-muted-foreground">
        {landingPageBullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
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
