import { ChatInput } from "@/components/ChatInput";
import { Button } from "@/components/button";
import { MessageSquare, Plus, X } from "lucide-react";

export type EditorChatVisualMode =
  | "editor-chat-open-mobile"
  | "editor-chat-closed";

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
        className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 border border-foreground" />
            <div className="h-6 w-6 rounded-full border border-foreground" />
            <div className="text-3xl leading-none text-foreground">/</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button size="sm" variant="secondary" className="h-6 px-2 text-xs">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Hide Chat
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
              Show Preview
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
              Review Changes
            </Button>
          </div>
        </div>

        <div className="flex-1 bg-white px-4 py-4">
          <div className="h-full min-h-[300px] border border-stone-200 bg-stone-50" />
        </div>

        <div className="min-h-0 shrink-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-[-1px] flex h-5 shrink-0 items-center justify-center text-muted-foreground">
              <div className="h-1 w-12 corner-notch-1 bg-current/40" />
            </div>
            <div className="min-h-0 flex-1">
              <div className="flex h-full min-h-0 flex-col corner-notch-1 border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border pl-3 pr-2 py-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Chat
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="New conversation"
                      className="corner-notch-1 p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Close chat"
                      className="corner-notch-1 p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-0 py-2">
                  <div className="mb-2 corner-notch-1 border border-border bg-muted/50 text-xs">
                    <div className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
                      <div className="h-3 w-3 shrink-0 text-current">›</div>
                      <span className="font-medium">Chat tools</span>
                      <span className="ml-auto corner-notch-1 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Enabled
                      </span>
                    </div>
                  </div>

                  <div className="mb-2 ml-auto max-w-[85%] corner-notch-1 bg-primary px-3 py-2 text-sm text-primary-foreground">
                    Move the chat into the editor.
                  </div>
                  <div className="mb-2 max-w-[85%] corner-notch-1 bg-muted px-3 py-2 text-sm text-foreground">
                    The mobile dock now runs edge to edge, without the extra
                    side gutter.
                  </div>
                </div>

                <div className="border-t border-border">
                  <ChatInput
                    value=""
                    onValueChange={() => {}}
                    onSend={() => {}}
                    mode="prosemark"
                    autoResize
                    sendButtonClassName="mr-2 mt-2 mb-0 p-2"
                  />
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
  return mode === "editor-chat-closed" ? (
    <ClosedChatFabFixture />
  ) : (
    <OpenMobileChatFixture />
  );
}
