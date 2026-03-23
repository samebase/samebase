import { Button } from "@/components/button";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditorChatVisualMode =
  | "editor-chat-open-desktop"
  | "editor-chat-open-mobile"
  | "editor-chat-closed";

const MOBILE_CHAT_FIXTURE_HEIGHT_PX = 280;
const MOBILE_CHAT_FIXTURE_DOCK_INSET = `calc(${MOBILE_CHAT_FIXTURE_HEIGHT_PX}px + 0.5rem)`;

function FixtureBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-none bg-current/50", className)}
    />
  );
}

function FixtureButtonLabel({ className }: { className?: string }) {
  return <FixtureBar className={cn("h-2.5", className)} />;
}

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
      <div className="flex items-center gap-1 text-current">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-2.5 w-px rounded-full bg-current" />
        ))}
      </div>
    </div>
  );
}

function FixtureComposer() {
  return (
    <div className="border-t border-border">
      <div className="flex items-end gap-2 pr-2 pt-2">
        <div className="min-h-[5.75rem] flex-1 border border-border bg-background">
          <FixtureBar className="ml-4 mt-4 h-4 w-40 bg-muted-foreground/35" />
        </div>
        <div className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500">
          <FixtureBar className="h-2.5 w-2.5 bg-white" />
        </div>
      </div>
    </div>
  );
}

function FixtureMessage({
  align = "left",
  tone = "muted",
  widthClass,
}: {
  align?: "left" | "right";
  tone?: "muted" | "primary";
  widthClass: string;
}) {
  const bubbleClassName =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-foreground";
  const firstLineClassName =
    tone === "primary" ? "bg-white/65" : "bg-current/45";
  const secondLineClassName =
    tone === "primary" ? "bg-white/45" : "bg-current/30";

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
        <FixtureBar className={cn("h-2.5", firstLineClassName)} />
        <FixtureBar className={cn("mt-2 h-2.5 w-4/5", secondLineClassName)} />
      </div>
    </div>
  );
}

function FixtureChatToolsRow() {
  return (
    <div className="mb-2 corner-notch-1 border border-border bg-muted/50 text-xs">
      <div className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
        <div className="h-3 w-3 shrink-0 bg-current/45" />
        <FixtureBar className="h-2.5 w-16 bg-current/40" />
        <div className="ml-auto corner-notch-1 bg-emerald-100 px-2 py-0.5 text-emerald-700">
          <FixtureBar className="h-2 w-10 bg-current/55" />
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
              <FixtureButtonLabel className="w-16" />
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
              <FixtureButtonLabel className="w-20" />
            </Button>
          </div>
        </div>

        <div
          className="flex-1 bg-white px-4 py-4"
          style={{ paddingBottom: MOBILE_CHAT_FIXTURE_DOCK_INSET }}
        >
          <div className="h-full min-h-[420px] border border-stone-200 bg-stone-50" />
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
                <div className="flex items-center gap-1 border-b border-border pl-1.5 pr-1 py-0">
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

                <div className="flex-1 overflow-y-auto px-0 py-2">
                  <FixtureChatToolsRow />
                  <FixtureMessage
                    align="right"
                    tone="primary"
                    widthClass="max-w-[85%] w-48"
                  />
                  <FixtureMessage widthClass="max-w-[85%] w-52" />
                </div>

                <FixtureComposer />
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
              <FixtureBar className="h-2.5 w-32 bg-muted-foreground/45" />
              <FixtureBar className="mt-2 h-3 w-20 bg-foreground/65" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                <FixtureButtonLabel className="w-16" />
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                <FixtureButtonLabel className="w-20" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white px-5 py-4">
          <div className="h-full border border-stone-200 bg-stone-50 px-6 py-5">
            <div className="h-7 w-56 bg-stone-100" />
            <div className="mt-4 h-5 w-4/5 bg-stone-100" />
            <div className="mt-3 h-5 w-3/5 bg-stone-100" />
            <div className="mt-6 h-40 w-full border border-stone-200 bg-white" />
          </div>
        </div>

        <div className="min-h-0 shrink-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 shrink-0">
              <div
                data-testid="editor-chat-panel-visual-fixture"
                className="flex h-[240px] min-h-0 flex-col corner-notch-1 border border-border bg-background"
              >
                <div className="flex items-center gap-1 border-b border-border pl-1.5 pr-1 py-0 sm:pl-2 sm:pr-1.5 sm:py-0">
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

                <div className="flex-1 overflow-y-auto px-3 py-2">
                  <FixtureChatToolsRow />
                  <FixtureMessage
                    align="right"
                    tone="primary"
                    widthClass="max-w-[60%] w-72"
                  />
                  <FixtureMessage widthClass="max-w-[68%] w-80" />
                </div>

                <FixtureComposer />
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
