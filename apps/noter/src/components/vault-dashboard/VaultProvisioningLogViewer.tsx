import Editor from "@monaco-editor/react";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  CODE_SURFACE_FONT_FAMILY,
  CODE_SURFACE_FONT_SIZE_PX,
  CODE_SURFACE_LINE_HEIGHT_PX,
} from "@/lib/codeSurfaceTypography";
import {
  buildProvisioningLogDocumentEvents,
  formatProvisioningLogDocument,
  type ProvisioningLogApiCall,
  type ProvisioningLogEvent,
  type ProvisioningLogDocumentEvent,
} from "@/lib/provisioningLog";

const MIN_EDITOR_HEIGHT_PX = 180;
const MAX_EDITOR_HEIGHT_PX = 360;
const EDITOR_VERTICAL_PADDING_PX = 20;

function buildProvisioningLogDocumentPath(repositoryFullName: string): string {
  return `noter-provisioning-log/${repositoryFullName}.json`;
}

function countDocumentLines(documentText: string): number {
  return documentText.split("\n").length;
}

type ProvisioningLogApiDocumentEvent = ProvisioningLogDocumentEvent & {
  api: ProvisioningLogApiCall;
};

function isApiCallEvent(
  event: ProvisioningLogDocumentEvent,
): event is ProvisioningLogApiDocumentEvent {
  return "api" in event;
}

function getApiCallEvents(
  events: ProvisioningLogDocumentEvent[],
): ProvisioningLogApiDocumentEvent[] {
  return events.filter(isApiCallEvent);
}

export function VaultProvisioningLogViewer(props: {
  events: ProvisioningLogEvent[];
  repositoryFullName: string;
}) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const documentText = useMemo(() => formatProvisioningLogDocument(props.events), [props.events]);
  const apiCallEvents = useMemo(
    () => getApiCallEvents(buildProvisioningLogDocumentEvents(props.events)),
    [props.events],
  );
  const editorHeightPx = Math.min(
    MAX_EDITOR_HEIGHT_PX,
    Math.max(
      MIN_EDITOR_HEIGHT_PX,
      countDocumentLines(documentText) * CODE_SURFACE_LINE_HEIGHT_PX + EDITOR_VERTICAL_PADDING_PX,
    ),
  );

  return (
    <div aria-label={`Provisioning log for ${props.repositoryFullName}`} role="region">
      {apiCallEvents.length > 0 ? (
        <div className="mb-2 grid gap-1 text-xs">
          {apiCallEvents.map((event) => (
            <div
              key={`${event.time}:${event.step}:${event.api.provider}:${event.api.method}:${event.api.endpoint}`}
              className="grid grid-cols-[5rem_3.5rem_minmax(0,1fr)] gap-2"
            >
              <span className="text-muted-foreground">{event.api.provider}</span>
              <span className="font-mono">{event.api.method}</span>
              <span className="min-w-0 break-words font-mono">{event.api.endpoint}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div
        className="notranslate w-full overflow-hidden border border-input bg-background"
        style={{ height: editorHeightPx }}
        translate="no"
      >
        <Editor
          height="100%"
          language="json"
          path={buildProvisioningLogDocumentPath(props.repositoryFullName)}
          theme={effectiveTheme === "dark" ? "vs-dark" : "vs"}
          value={documentText}
          options={{
            automaticLayout: true,
            cursorStyle: "line-thin",
            domReadOnly: true,
            folding: true,
            fontFamily: CODE_SURFACE_FONT_FAMILY,
            fontLigatures: false,
            fontSize: CODE_SURFACE_FONT_SIZE_PX,
            glyphMargin: false,
            lineHeight: CODE_SURFACE_LINE_HEIGHT_PX,
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            minimap: { enabled: false },
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            padding: {
              bottom: 0,
              top: 0,
            },
            readOnly: true,
            renderLineHighlight: "none",
            scrollBeyondLastLine: false,
            scrollbar: {
              alwaysConsumeMouseWheel: false,
              horizontal: "auto",
              horizontalScrollbarSize: 10,
              vertical: "auto",
              verticalScrollbarSize: 10,
            },
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}

export function VaultProvisioningLog(props: { repositoryFullName: string; vaultId: Id<"vaults"> }) {
  const events = useQuery(api.appProvisioningEvents.listForVault, {
    vaultId: props.vaultId,
  });
  if (!events || events.length === 0) {
    return null;
  }

  return (
    <VaultProvisioningLogViewer events={events} repositoryFullName={props.repositoryFullName} />
  );
}
