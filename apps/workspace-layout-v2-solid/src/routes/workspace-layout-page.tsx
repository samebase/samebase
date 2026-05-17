import { onCleanup, onMount, type JSX } from "solid-js";
import { MonacoSurface } from "#src/components/MonacoSurface.tsx";
import { ProsemarkSurface } from "#src/components/ProsemarkSurface.tsx";
import solidLabGuideRaw from "../../../../AGENTS.md?raw";
import workspaceLayoutSourceRaw from "../../../noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx?raw";

const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_PANE_PEEK_PX = 32;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;
const RIGHT_SIDEBAR_LINK_HREF =
  "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Overflow/Carousels";

function scrollToMobilePane(args: {
  carouselNode: HTMLDivElement;
  paneNode: HTMLElement;
}) {
  args.carouselNode.scrollLeft = args.paneNode.offsetLeft;
}

function Pane(props: {
  children: JSX.Element;
  class: string;
  dataTestId: string;
}) {
  return (
    <section class={props.class} data-testid={props.dataTestId}>
      {props.children}
    </section>
  );
}

function RightSidebarLink() {
  return (
    <div class="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
      <a
        class="underline underline-offset-2"
        href={RIGHT_SIDEBAR_LINK_HREF}
        rel="noreferrer"
        target="_blank"
      >
        MDN CSS overflow carousel guide
      </a>
    </div>
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

  const mobileEditorSidebarStyle = {
    "max-width": `calc(100% - ${MOBILE_PANE_PEEK_PX}px)`,
    "min-width": `${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`,
    width: "min(22rem, calc(100% - 32px))",
  } satisfies JSX.CSSProperties;
  const mobileLinkSidebarStyle = {
    "max-width": `calc(100% - ${MOBILE_PANE_PEEK_PX}px)`,
    "min-width": `${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`,
    width: "fit-content",
  } satisfies JSX.CSSProperties;
  const mobileMainStyle = {
    width: "100%",
  } satisfies JSX.CSSProperties;

  return (
    <main class="h-svh bg-background text-foreground">
      <div
        class="hidden h-full min-h-0 md:flex"
        data-workspace-layout-v2="desktop"
      >
        <Pane
          class="flex h-full min-h-0 w-80 overflow-hidden border-r border-border bg-background"
          dataTestId="workspace-layout-v2-pane-left"
        >
          <ProsemarkSurface
            dataTestId="workspace-layout-v2-surface-left"
            initialValue={solidLabGuideRaw}
          />
        </Pane>

        <Pane
          class="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
          dataTestId="workspace-layout-v2-pane-main"
        >
          <MonacoSurface
            dataTestId="workspace-layout-v2-surface-main"
            initialValue={workspaceLayoutSourceRaw}
          />
        </Pane>

        <Pane
          class="flex h-full min-h-0 w-fit min-w-40 max-w-xs overflow-hidden border-l border-border bg-background"
          dataTestId="workspace-layout-v2-pane-right"
        >
          <RightSidebarLink />
        </Pane>
      </div>

      <div
        class="relative h-full min-h-0 md:hidden"
        data-workspace-layout-v2="mobile"
      >
        <div
          ref={mobileCarouselRef}
          class="absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div class="h-full shrink-0" style={mobileEditorSidebarStyle}>
            <Pane
              class="flex h-full min-h-0 shrink-0 snap-start [scroll-snap-stop:always] box-border overflow-hidden border-r border-border bg-background"
              dataTestId="workspace-layout-v2-pane-left"
            >
              <ProsemarkSurface
                dataTestId="workspace-layout-v2-surface-left"
                initialValue={solidLabGuideRaw}
              />
            </Pane>
          </div>

          <div
            ref={mobileMainPaneRef}
            class="h-full shrink-0"
            style={mobileMainStyle}
          >
            <Pane
              class="flex h-full min-h-0 shrink-0 snap-start [scroll-snap-stop:always] overflow-hidden bg-background"
              dataTestId="workspace-layout-v2-pane-main"
            >
              <MonacoSurface
                dataTestId="workspace-layout-v2-surface-main"
                initialValue={workspaceLayoutSourceRaw}
              />
            </Pane>
          </div>

          <div class="h-full shrink-0" style={mobileLinkSidebarStyle}>
            <Pane
              class="flex h-full min-h-0 shrink-0 snap-end [scroll-snap-stop:always] box-border overflow-hidden border-l border-border bg-background"
              dataTestId="workspace-layout-v2-pane-right"
            >
              <RightSidebarLink />
            </Pane>
          </div>
        </div>
      </div>
    </main>
  );
}
