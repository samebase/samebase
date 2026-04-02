import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MachinesThreadComposerControls } from "./MachinesThreadComposerControls";

describe("MachinesThreadComposerControls", () => {
  it("renders the selected model and reasoning labels in the compact control row", () => {
    const markup = renderToStaticMarkup(
      <MachinesThreadComposerControls
        model="gpt-5.4"
        reasoningEffort="xhigh"
        onModelChange={() => {}}
        onReasoningEffortChange={() => {}}
      />,
    );

    expect(markup).toContain("GPT-5.4");
    expect(markup).toContain("Extra High");
    expect(markup).toContain("text-[14px]");
  });
});
