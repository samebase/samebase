import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { renderLandingCopyShellHtml } from "@/lib/landingCopyShell";

export type LandingCopyVisualMode = "landing-copy-parity";

const LANDING_COPY_VISUAL_FIXTURE_MARKDOWN = `## noter can disappear tomorrow and your app will be completely unimpacted

- your notes and code live in a real repository
- collaborate in real time with your team
- work from desktop or mobile without context switching
- use Codex to ship small apps directly from your workspace`;

function BootstrapLandingCopyShell({ markdown }: { markdown: string }) {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: renderLandingCopyShellHtml(markdown) }}
    />
  );
}

export function LandingCopyVisualFixture() {
  return (
    <div
      data-testid="landing-copy-visual-fixture"
      className="min-h-screen bg-background px-8 py-12 text-foreground"
    >
      <div className="mx-auto flex max-w-5xl items-start justify-center gap-12">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Bootstrap
          </div>
          <div
            data-testid="landing-copy-tailwind"
            className="w-[384px] bg-background"
          >
            <BootstrapLandingCopyShell
              markdown={LANDING_COPY_VISUAL_FIXTURE_MARKDOWN}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            ProseMark
          </div>
          <div
            data-testid="landing-copy-prosemark"
            className="w-[384px] bg-background"
          >
            <ProsemarkReadOnly
              value={LANDING_COPY_VISUAL_FIXTURE_MARKDOWN}
              className="text-sm"
              styleVariant="landingCopy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
