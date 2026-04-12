import { LandingCopy } from "@/components/LandingCopy";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";

const LANDING_COPY_VISUAL_SCENARIOS = {
  "landing-copy-parity": {
    markdown: `## noter can disappear tomorrow and your app will be completely unimpacted

- your notes and code live in a real repository
- collaborate in real time with your team
- work from desktop or mobile without context switching
- use Codex to ship small apps directly from your workspace`,
    editable: false,
  },
  "landing-copy-editable-parity-single-line": {
    markdown: `## ship from markdown

- your notes and code live in a real repository
- collaborate in real time with your team
- work from desktop or mobile without context switching
- use Codex to ship small apps directly from your workspace`,
    editable: true,
  },
  "landing-copy-editable-parity-two-line": {
    markdown: `## noter is a collaborative markdown workspace on top of GitHub

- your notes and code live in a real repository
- collaborate in real time with your team
- work from desktop or mobile without context switching
- use Codex to ship small apps directly from your workspace`,
    editable: true,
  },
  "landing-copy-editable-parity-three-line": {
    markdown: `## the collaborative markdown workspace for product teams shipping directly from GitHub every day

- your notes and code live in a real repository
- collaborate in real time with your team
- work from desktop or mobile without context switching
- use Codex to ship small apps directly from your workspace`,
    editable: true,
  },
} as const;

export type LandingCopyVisualMode = keyof typeof LANDING_COPY_VISUAL_SCENARIOS;

export function LandingCopyVisualFixture({
  mode,
}: {
  mode: LandingCopyVisualMode;
}) {
  const scenario = LANDING_COPY_VISUAL_SCENARIOS[mode];

  return (
    <div
      data-testid="landing-copy-visual-fixture"
      className="min-h-screen bg-background px-8 py-12 text-foreground"
    >
      <div className="mx-auto flex max-w-5xl items-start justify-center gap-12">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Shell
          </div>
          <div
            data-testid="landing-copy-tailwind"
            className="w-[384px] bg-background"
          >
            <LandingCopy className="text-sm" markdown={scenario.markdown} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {scenario.editable ? "ProseMark Editable" : "ProseMark"}
          </div>
          <div
            data-testid="landing-copy-prosemark"
            className="w-[384px] bg-background"
          >
            <ProsemarkReadOnly
              value={scenario.markdown}
              className="text-sm"
              editable={scenario.editable}
              styleVariant="landingCopy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
