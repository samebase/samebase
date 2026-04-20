import { For, onCleanup, onMount, type JSX } from "solid-js";
import solidLabNotesRaw from "../../SOLID_LAB_NOTES.md?raw";

const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_PANE_PEEK_PX = 32;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;

type SidebarSection = {
  items: readonly string[];
  title: string;
};

const leftSidebarSections = [
  {
    title: "Files",
    items: [
      "workspace-layout-v2.tsx",
      "workspace-layout-v2.css",
      "left-sidebar.md",
      "sidebar-state.ts",
    ],
  },
  {
    title: "Filters",
    items: ["Pinned", "Recent", "Drafts", "Archived"],
  },
] satisfies readonly SidebarSection[];

const rightSidebarSections = [
  {
    title: "Inspector",
    items: ["Outline", "Activity", "Comments", "Linked docs"],
  },
  {
    title: "Selection",
    items: ["Type: document", "Owner: nicu", "Updated: today"],
  },
] satisfies readonly SidebarSection[];

function scrollToMobilePane(args: {
  carouselNode: HTMLDivElement;
  paneNode: HTMLElement;
}) {
  args.carouselNode.scrollLeft = Math.max(
    0,
    args.paneNode.offsetLeft - MOBILE_PANE_PEEK_PX,
  );
}

function PaneFrame(props: {
  bodyClass?: string;
  children: JSX.Element;
  class: string;
  dataTestId: string;
  title: string;
}) {
  return (
    <section class={props.class} data-testid={props.dataTestId}>
      <header class="border-b border-border px-3 py-2 text-sm font-medium">
        {props.title}
      </header>
      <div class={props.bodyClass ?? "min-h-0 flex-1 overflow-y-auto"}>
        {props.children}
      </div>
    </section>
  );
}

function SidebarBody(props: { sections: readonly SidebarSection[] }) {
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-3 text-sm">
      <For each={props.sections}>
        {(section) => (
          <section class="space-y-2">
            <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h2>
            <ul class="space-y-1">
              <For each={section.items}>
                {(item) => <li class="truncate">{item}</li>}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}

function MainBody() {
  return (
    <pre class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-3 text-sm leading-6">
      {solidLabNotesRaw}
    </pre>
  );
}

function DesktopPane(props: {
  body: JSX.Element;
  class: string;
  dataTestId: string;
  title: string;
}) {
  return (
    <PaneFrame
      class={`flex h-full min-h-0 flex-col overflow-hidden bg-background ${props.class}`}
      dataTestId={props.dataTestId}
      title={props.title}
    >
      {props.body}
    </PaneFrame>
  );
}

function MobileSidebarPane(props: {
  body: JSX.Element;
  dataTestId: string;
  title: string;
}) {
  return (
    <PaneFrame
      class="flex h-full min-h-0 shrink-0 snap-start [scroll-snap-stop:always] flex-col overflow-hidden bg-background"
      dataTestId={props.dataTestId}
      title={props.title}
    >
      {props.body}
    </PaneFrame>
  );
}

function MobileMainPane(props: {
  body: JSX.Element;
  dataTestId: string;
  title: string;
}) {
  return (
    <PaneFrame
      bodyClass="min-h-0 flex-1 overflow-hidden"
      class="flex h-full min-h-0 shrink-0 snap-start [scroll-snap-stop:always] flex-col overflow-hidden bg-background"
      dataTestId={props.dataTestId}
      title={props.title}
    >
      {props.body}
    </PaneFrame>
  );
}

export function WorkspaceLayoutPage() {
  let mobileCarouselRef: HTMLDivElement | undefined;
  let mobileMainPaneRef: HTMLDivElement | undefined;

  onMount(() => {
    const carouselNode = mobileCarouselRef;
    const mainPaneNode = mobileMainPaneRef;
    if (!carouselNode || !mainPaneNode) {
      return;
    }

    const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT_PX;
    const scrollToMainPane = () => {
      if (!isMobile()) {
        return;
      }

      scrollToMobilePane({
        carouselNode,
        paneNode: mainPaneNode,
      });
    };

    const mediaQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`,
    );
    const handleViewportChange = () => {
      if (mediaQuery.matches) {
        scrollToMainPane();
      }
    };

    requestAnimationFrame(scrollToMainPane);
    handleViewportChange();
    mediaQuery.addEventListener("change", handleViewportChange);

    onCleanup(() => {
      mediaQuery.removeEventListener("change", handleViewportChange);
    });
  });

  const mobileSidebarStyle = {
    "max-width": `calc(100% - ${MOBILE_PANE_PEEK_PX}px)`,
    "min-width": `${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`,
    width: "fit-content",
  } satisfies JSX.CSSProperties;
  const mobileMainStyle = {
    width: `calc(100% - ${MOBILE_PANE_PEEK_PX * 2}px)`,
  } satisfies JSX.CSSProperties;

  const leftBody = () => <SidebarBody sections={leftSidebarSections} />;
  const mainBody = () => <MainBody />;
  const rightBody = () => <SidebarBody sections={rightSidebarSections} />;

  return (
    <main class="h-svh bg-background text-foreground">
      <div
        class="hidden h-full min-h-0 md:flex"
        data-workspace-layout-v2="desktop"
      >
        <DesktopPane
          body={leftBody()}
          class="w-72 border-r border-border"
          dataTestId="workspace-layout-v2-pane-left"
          title="Left Sidebar"
        />
        <DesktopPane
          body={mainBody()}
          class="min-w-0 flex-1"
          dataTestId="workspace-layout-v2-pane-main"
          title="Main Pane"
        />
        <DesktopPane
          body={rightBody()}
          class="w-72 border-l border-border"
          dataTestId="workspace-layout-v2-pane-right"
          title="Right Sidebar"
        />
      </div>

      <div
        class="relative h-full min-h-0 md:hidden"
        data-workspace-layout-v2="mobile"
      >
        <div
          ref={mobileCarouselRef}
          class="absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            "padding-left": `${MOBILE_PANE_PEEK_PX}px`,
            "padding-right": `${MOBILE_PANE_PEEK_PX}px`,
          }}
        >
          <div class="h-full shrink-0" style={mobileSidebarStyle}>
            <MobileSidebarPane
              body={leftBody()}
              dataTestId="workspace-layout-v2-pane-left"
              title="Left Sidebar"
            />
          </div>

          <div
            ref={mobileMainPaneRef}
            class="h-full shrink-0"
            style={mobileMainStyle}
          >
            <MobileMainPane
              body={mainBody()}
              dataTestId="workspace-layout-v2-pane-main"
              title="Main Pane"
            />
          </div>

          <div class="h-full shrink-0" style={mobileSidebarStyle}>
            <MobileSidebarPane
              body={rightBody()}
              dataTestId="workspace-layout-v2-pane-right"
              title="Right Sidebar"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
