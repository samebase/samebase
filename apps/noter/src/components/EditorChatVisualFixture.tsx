import { Button } from "@/components/button";
import { EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME } from "@/components/editorChatLayout";
import { ResizeGripLines } from "@/components/ResizeGripLines";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditorChatVisualMode =
  | "editor-chat-open-desktop"
  | "editor-chat-open-mobile"
  | "editor-chat-closed";

const MOBILE_CHAT_FIXTURE_HEIGHT_PX = 280;
const MOBILE_CHAT_FIXTURE_DOCK_INSET = `calc(${MOBILE_CHAT_FIXTURE_HEIGHT_PX}px + 0.5rem)`;

type FixtureMessageCopy = {
  lines: string[];
  widthClass: string;
  align?: "left" | "right";
  tone?: "muted" | "primary";
};

const MOBILE_CHAT_MESSAGES: FixtureMessageCopy[] = [
  {
    align: "right",
    tone: "primary",
    widthClass: "max-w-[85%] w-52",
    lines: [
      "Keep the dock full width.",
      "Match the inner width to the dashboard.",
    ],
  },
  {
    widthClass: "max-w-[85%] w-56",
    lines: ["Done.", "The content frame is centered now."],
  },
];

const DESKTOP_CHAT_MESSAGES: FixtureMessageCopy[] = [
  {
    align: "right",
    tone: "primary",
    widthClass: "max-w-[60%] w-80",
    lines: [
      "The full-width dock is good.",
      "Constrain the conversation content to the dashboard width.",
    ],
  },
  {
    widthClass: "max-w-[68%] w-[26rem]",
    lines: [
      "Updated.",
      "Messages, tools, and the composer now share the dashboard max width.",
    ],
  },
];

function FixtureToolbarIcon({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-6 w-6 border border-foreground", className)}
    />
  );
}

function FixtureResizeGrip() {
  return (
    <div className="flex h-4 w-full items-center justify-center corner-notch-1 text-foreground/80">
      <ResizeGripLines />
    </div>
  );
}

function FixtureComposer() {
  return (
    <div className="border-t border-border">
      <div className="flex items-end gap-2 pr-2 pt-2">
        <div className="min-h-[5.75rem] flex-1 border border-border bg-background px-4 py-3">
          <p className="text-sm leading-5 text-muted-foreground">
            Align the chat content with the dashboard frame.
          </p>
        </div>
        <div className="mb-2 flex h-10 shrink-0 items-center justify-center rounded-full bg-blue-500 px-3 text-xs font-medium text-white">
          Send
        </div>
      </div>
    </div>
  );
}

function FixtureMessage({
  align = "left",
  tone = "muted",
  widthClass,
  lines,
}: {
  align?: "left" | "right";
  tone?: "muted" | "primary";
  widthClass: string;
  lines: string[];
}) {
  const bubbleClassName =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-foreground";

  return (
    <div
      className={cn(
        "mb-2 flex",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn("corner-notch-1 px-3 py-2", bubbleClassName, widthClass)}
      >
        {lines.map((line, index) => (
          <p
            key={index}
            className={cn("text-sm leading-5", index > 0 && "mt-1 opacity-90")}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function FixtureChatToolsRow() {
  return (
    <div className="mb-2 corner-notch-1 border border-border bg-muted/50 text-xs">
      <div className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
        <div className="h-3 w-3 shrink-0 bg-current/45" />
        <span className="font-medium text-foreground">Chat tools</span>
        <span>Repository-aware prompts are enabled.</span>
        <div className="ml-auto corner-notch-1 bg-emerald-100 px-2 py-0.5 text-emerald-700">
          Enabled
        </div>
      </div>
    </div>
  );
}

function ClosedChatFabFixture() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-10 text-stone-950">
      <div
        data-testid="editor-chat-visual-fixture"
        className="relative h-[320px] w-[320px] overflow-hidden corner-notch-1 border border-stone-300 bg-white"
      >
        <div className="h-full p-6">
          <div className="h-8 w-40 bg-stone-100" />
          <div className="mt-4 h-40 border border-stone-200 bg-stone-50" />
        </div>
        <Button
          type="button"
          size="icon"
          variant="default"
          aria-label="Open chat"
          className="absolute bottom-3 right-3 z-10 flex h-11 w-11 items-center justify-center corner-notch-1 border-0 bg-primary p-0 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
        >
          <span aria-hidden="true" className="h-4 w-4 bg-current" />
        </Button>
      </div>
    </div>
  );
}

function OpenMobileChatFixture() {
  return (
    <div className="min-h-screen bg-stone-100 p-0 text-stone-950">
      <div
        data-testid="editor-chat-visual-fixture"
        className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col overflow-hidden bg-white"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FixtureToolbarIcon />
            <FixtureToolbarIcon className="rounded-full" />
            <div className="flex h-6 w-6 items-center justify-center">
              <div className="h-6 w-px -rotate-[20deg] bg-foreground" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
              Files
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
              Preview
            </Button>
          </div>
        </div>

        <div
          className="flex-1 bg-white px-4 py-4"
          style={{ paddingBottom: MOBILE_CHAT_FIXTURE_DOCK_INSET }}
        >
          <div className="h-full min-h-[420px] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-xs uppercase tracking-wide text-stone-500">
              Branch summary
            </div>
            <h2 className="mt-2 text-lg font-semibold text-stone-950">
              codex/chat-content-max-width
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Keep the mobile chat dock anchored to the viewport, but let the
              conversation content follow the same centered frame used elsewhere
              in the app.
            </p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-2 pb-2">
          <div
            className="flex min-h-0 flex-col"
            style={{ height: `${MOBILE_CHAT_FIXTURE_HEIGHT_PX}px` }}
          >
            <div className="min-h-0 flex-1">
              <div
                data-testid="editor-chat-panel-visual-fixture"
                className="flex h-full min-h-0 flex-col corner-notch-1 border border-border bg-background"
              >
                <div className="border-b border-border">
                  <div
                    className={cn(
                      "flex items-center gap-1 py-0",
                      EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME,
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <FixtureResizeGrip />
                    </div>
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        aria-label="New conversation"
                        className="corner-notch-1 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Close chat"
                        className="corner-notch-1 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                  <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
                    <FixtureChatToolsRow />
                    {MOBILE_CHAT_MESSAGES.map((message) => (
                      <FixtureMessage
                        key={message.lines[0]}
                        align={message.align}
                        tone={message.tone}
                        widthClass={message.widthClass}
                        lines={message.lines}
                      />
                    ))}
                  </div>
                </div>

                <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
                  <FixtureComposer />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpenDesktopChatFixture() {
  return (
    <div className="min-h-screen bg-stone-100 p-10 text-stone-950">
      <div
        data-testid="editor-chat-visual-fixture"
        className="mx-auto flex h-[720px] w-[1024px] flex-col overflow-hidden border border-stone-300 bg-white"
      >
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Workspace
              </div>
              <div className="mt-1 text-sm font-medium">noter-md/noter</div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                Open app
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                Share preview
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white px-5 py-4">
          <div className="h-full border border-stone-200 bg-stone-50 px-6 py-5">
            <div className="text-xs uppercase tracking-wide text-stone-500">
              Current task
            </div>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              Align chat content with the dashboard frame
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-700">
              The dock can keep spanning the full width of the workspace. The
              actual conversation UI should stop at the same max width used by
              dashboard content so the layout feels consistent.
            </p>
            <div className="mt-6 border border-stone-200 bg-white p-4">
              <div className="text-sm font-medium text-stone-950">
                Expected result
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                Header controls, message bubbles, tool rows, and the composer
                all sit inside one centered content frame.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 shrink-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 shrink-0">
              <div
                data-testid="editor-chat-panel-visual-fixture"
                className="flex h-[240px] min-h-0 flex-col corner-notch-1 border border-border bg-background"
              >
                <div className="border-b border-border">
                  <div
                    className={cn(
                      "flex items-center gap-1 py-0",
                      EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME,
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <FixtureResizeGrip />
                    </div>
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        aria-label="New conversation"
                        className="corner-notch-1 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Close chat"
                        className="corner-notch-1 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                  <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
                    <FixtureChatToolsRow />
                    {DESKTOP_CHAT_MESSAGES.map((message) => (
                      <FixtureMessage
                        key={message.lines[0]}
                        align={message.align}
                        tone={message.tone}
                        widthClass={message.widthClass}
                        lines={message.lines}
                      />
                    ))}
                  </div>
                </div>

                <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
                  <FixtureComposer />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditorChatVisualFixture({
  mode,
}: {
  mode: EditorChatVisualMode;
}) {
  if (mode === "editor-chat-closed") {
    return <ClosedChatFabFixture />;
  }

  if (mode === "editor-chat-open-desktop") {
    return <OpenDesktopChatFixture />;
  }

  return <OpenMobileChatFixture />;
}
