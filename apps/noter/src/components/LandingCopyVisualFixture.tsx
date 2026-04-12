import { LandingCopy } from "@/components/LandingCopy";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";

const LANDING_COPY_VISUAL_SCENARIOS = {
  "landing-copy-parity": {
    markdown: `## the link between ChatGPT and Codex

- connect your computer once so ChatGPT can reach the same Codex setup
- use the same repo, tools, and machine from ChatGPT or Codex
- continue the work from desktop or mobile without losing context
- keep notes, code, and approvals in a real repository`,
    editable: false,
  },
  "landing-copy-editable-parity-single-line": {
    markdown: `## connect ChatGPT to your Codex setup

- connect your computer once so ChatGPT can reach the same Codex setup
- use the same repo, tools, and machine from ChatGPT or Codex
- continue the work from desktop or mobile without losing context
- keep notes, code, and approvals in a real repository`,
    editable: true,
  },
  "landing-copy-editable-parity-two-line": {
    markdown: `## your Codex machine, from anywhere

- connect your computer once so ChatGPT can reach the same Codex setup
- use the same repo, tools, and machine from ChatGPT or Codex
- continue the work from desktop or mobile without losing context
- keep notes, code, and approvals in a real repository`,
    editable: true,
  },
  "landing-copy-editable-parity-three-line": {
    markdown: `## connect your computer once, then keep going from ChatGPT or Codex

- connect your computer once so ChatGPT can reach the same Codex setup
- use the same repo, tools, and machine from ChatGPT or Codex
- continue the work from desktop or mobile without losing context
- keep notes, code, and approvals in a real repository`,
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
