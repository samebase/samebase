import { landingPageMarkdown } from "@/publicSite/landingPageContent";
import { cn } from "@/lib/utils";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

const EditableLandingCopy = lazy(async () => {
  const module = await import("@/editors/ProsemarkReadOnly");
  return { default: module.ProsemarkReadOnly };
});

type LandingCopyBlock =
  | {
      kind: "heading";
      text: string;
    }
  | {
      items: string[];
      kind: "list";
    }
  | {
      kind: "paragraph";
      text: string;
    };

function parseStaticLandingCopy(markdown: string): LandingCopyBlock[] {
  const blocks: LandingCopyBlock[] = [];
  let pendingListItems: string[] = [];

  const flushPendingList = () => {
    if (pendingListItems.length === 0) {
      return;
    }

    blocks.push({
      items: pendingListItems,
      kind: "list",
    });
    pendingListItems = [];
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushPendingList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushPendingList();
      blocks.push({
        kind: "heading",
        text: line.slice(3).trim(),
      });
      continue;
    }

    if (line.startsWith("- ")) {
      pendingListItems.push(line.slice(2).trim());
      continue;
    }

    flushPendingList();
    blocks.push({
      kind: "paragraph",
      text: line,
    });
  }

  flushPendingList();
  return blocks;
}

function StaticLandingCopy({ className, markdown }: { className?: string; markdown: string }) {
  const blocks = parseStaticLandingCopy(markdown);

  // These line boxes mirror the editable ProseMark surface so toggling `?dev`
  // can swap in the editor without moving the landing card.
  return (
    <div className={cn("min-h-[1rem]", className, "text-[14.4px]")}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <div key={`heading-${index}`}>
                <h2 className="m-0 text-[20.16px] font-bold leading-[28.8px]">{block.text}</h2>
                <div aria-hidden="true" className="h-[20.578px]" />
              </div>
            );
          case "list":
            return (
              <ul className="m-0 list-none p-0" key={`list-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li
                    className="pl-[19.125px] indent-[-13.125px] leading-[20.578px]"
                    key={`${item}-${itemIndex}`}
                  >
                    <span aria-hidden="true" className="inline-block w-[1ch] text-center">
                      {"\u2022"}
                    </span>
                    <span> {item}</span>
                  </li>
                ))}
              </ul>
            );
          case "paragraph":
            return (
              <p className="m-0 leading-[20.578px]" key={`paragraph-${index}`}>
                {block.text}
              </p>
            );
          default:
            block satisfies never;
            return null;
        }
      })}
    </div>
  );
}

/**
 * Returns true only after React has attached to the server-rendered landing
 * markup. `typeof window` is not enough here: it is already true during the
 * first client render, so branching on it would make hydration compare the
 * server's static HTML against the editable ProseMark tree.
 */
function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
}

/**
 * Renders the same static copy during SSR and the first client render, then
 * mounts editable ProseMark after hydration. This keeps `/?dev` editable while
 * avoiding React hydration recovery for two different markup trees.
 */
function EditableLandingCopyAfterHydration({
  className,
  markdown,
  onChange,
  staticCopy,
}: {
  className?: string;
  markdown: string;
  onChange?: (value: string) => void;
  staticCopy: ReactNode;
}) {
  const hasHydrated = useHasHydrated();

  if (!hasHydrated) {
    return staticCopy;
  }

  return (
    <Suspense fallback={staticCopy}>
      <EditableLandingCopy
        value={markdown}
        filePath="README.md"
        // The static renderer uses native blocks; keep the editable ProseMark baseline aligned.
        className={cn(className, "pt-px")}
        editable={true}
        onChange={onChange}
      />
    </Suspense>
  );
}

export function LandingCopy({
  className,
  editable = false,
  markdown = landingPageMarkdown,
  onChange,
}: {
  className?: string;
  editable?: boolean;
  markdown?: string;
  onChange?: (value: string) => void;
}) {
  const staticCopy = <StaticLandingCopy className={className} markdown={markdown} />;

  if (!editable) {
    return staticCopy;
  }

  return (
    <EditableLandingCopyAfterHydration
      className={className}
      markdown={markdown}
      onChange={onChange}
      staticCopy={staticCopy}
    />
  );
}
