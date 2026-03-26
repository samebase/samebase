import {
  ThreadBrowserView,
  type ThreadBrowserViewProps,
} from "@/components/ThreadBrowserView";
import { toThreadBrowserThread } from "@/lib/codexThreadBrowserAdapter";
import { type CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  type ThreadBrowserDetailState,
  type ThreadBrowserMode,
} from "@/lib/threadBrowser";

export type CodexThreadBrowserMode = ThreadBrowserMode;
export type CodexThreadBrowserDetailState = ThreadBrowserDetailState;

export type CodexThreadBrowserGroup = {
  id: string;
  label: string;
  detail: string;
  count: number;
  loadedCount: number;
  threads: CodexAppServerThread[];
};

export type CodexThreadBrowserViewProps = Omit<
  ThreadBrowserViewProps,
  | "pinnedThreads"
  | "groups"
  | "selectedThread"
  | "eyebrow"
  | "title"
  | "description"
> & {
  pinnedThreads: CodexAppServerThread[];
  groups: CodexThreadBrowserGroup[];
  selectedThread: CodexAppServerThread | null;
  eyebrow?: string;
  title?: string;
  description?: ThreadBrowserViewProps["description"];
};

/**
 * Keep the existing research/browser routes on Codex-specific types for now,
 * but render them through the provider-neutral thread-browser view model.
 */
export function CodexThreadBrowserView(props: CodexThreadBrowserViewProps) {
  return (
    <ThreadBrowserView
      {...props}
      eyebrow={props.eyebrow ?? "Research Surface"}
      title={props.title ?? "Codex Thread Browser"}
      description={
        props.description ?? (
          <>
            A Codex-style thread browser driven by the local{" "}
            <code>codex app-server</code> inventory.
          </>
        )
      }
      pinnedThreads={props.pinnedThreads.map(toThreadBrowserThread)}
      groups={props.groups.map((group) => ({
        ...group,
        threads: group.threads.map(toThreadBrowserThread),
      }))}
      selectedThread={
        props.selectedThread
          ? toThreadBrowserThread(props.selectedThread)
          : null
      }
    />
  );
}
