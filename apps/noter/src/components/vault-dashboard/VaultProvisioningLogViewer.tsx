import Editor from "@monaco-editor/react";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CODE_SURFACE_FONT_FAMILY } from "@/lib/codeSurfaceTypography";
import {
  buildProvisioningLogDocumentEvents,
  formatProvisioningLogApiValues,
  type ProvisioningLogApiCall,
  type ProvisioningLogEvent,
  type ProvisioningLogDocumentEvent,
} from "@/lib/provisioningLog";

const LOG_FONT_SIZE_PX = 12;
const LOG_LINE_HEIGHT_PX = 18;
const MIN_VALUE_EDITOR_HEIGHT_PX = 48;
const MAX_VALUE_EDITOR_HEIGHT_PX = 170;
const VALUE_EDITOR_VERTICAL_PADDING_PX = 8;

type ProvisioningLogApiDocumentEvent = ProvisioningLogDocumentEvent & {
  api: ProvisioningLogApiCall;
};

function buildProvisioningLogValueDocumentPath(
  repositoryFullName: string,
  event: ProvisioningLogApiDocumentEvent,
): string {
  return [
    "noter-provisioning-log",
    encodeURIComponent(repositoryFullName),
    `${encodeURIComponent(event.time)}-${event.api.provider}-${event.api.method}-${encodeURIComponent(
      event.api.endpoint,
    )}.json`,
  ].join("/");
}

function countDocumentLines(documentText: string): number {
  return documentText.split("\n").length;
}

function getValueEditorHeight(documentText: string): number {
  return Math.min(
    MAX_VALUE_EDITOR_HEIGHT_PX,
    Math.max(
      MIN_VALUE_EDITOR_HEIGHT_PX,
      countDocumentLines(documentText) * LOG_LINE_HEIGHT_PX + VALUE_EDITOR_VERTICAL_PADDING_PX,
    ),
  );
}

function formatNonApiLogEvent(event: ProvisioningLogDocumentEvent): string {
  if ("message" in event) {
    return `${event.time} ${event.level.toUpperCase()} ${event.step} - ${event.message}`;
  }

  return `${event.time} ${event.level.toUpperCase()} ${event.step}`;
}

export function VaultProvisioningLogViewer(props: {
  events: ProvisioningLogEvent[];
  repositoryFullName: string;
}) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const logEvents = useMemo(() => buildProvisioningLogDocumentEvents(props.events), [props.events]);

  return (
    <div
      aria-label={`Provisioning log for ${props.repositoryFullName}`}
      role="region"
      className="grid gap-3"
    >
      {logEvents.map((event) =>
        "api" in event ? (
          <ProvisioningLogApiEventViewer
            key={`${event.time}:${event.step}:${event.api.provider}:${event.api.method}:${event.api.endpoint}`}
            event={event}
            repositoryFullName={props.repositoryFullName}
            theme={effectiveTheme === "dark" ? "vs-dark" : "vs"}
          />
        ) : (
          <div
            key={`${event.time}:${event.step}:${event.message}`}
            className="font-mono text-xs text-muted-foreground"
          >
            {formatNonApiLogEvent(event)}
          </div>
        ),
      )}
    </div>
  );
}

function ProvisioningLogApiEventViewer(props: {
  event: ProvisioningLogApiDocumentEvent;
  repositoryFullName: string;
  theme: "vs" | "vs-dark";
}) {
  const valuesText = useMemo(
    () => formatProvisioningLogApiValues(props.event.api),
    [props.event.api],
  );
  const editorHeightPx = getValueEditorHeight(valuesText);

  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[5rem_3.5rem_minmax(0,1fr)] gap-2 text-xs">
        <span className="text-muted-foreground">{props.event.api.provider}</span>
        <span className="font-mono">{props.event.api.method}</span>
        <span className="min-w-0 break-words font-mono">{props.event.api.endpoint}</span>
      </div>
      <div
        className="notranslate w-full overflow-hidden border border-input bg-background"
        style={{ height: editorHeightPx }}
        translate="no"
      >
        <Editor
          height="100%"
          language="json"
          path={buildProvisioningLogValueDocumentPath(props.repositoryFullName, props.event)}
          theme={props.theme}
          value={valuesText}
          options={{
            automaticLayout: true,
            cursorStyle: "line-thin",
            domReadOnly: true,
            folding: false,
            fontFamily: CODE_SURFACE_FONT_FAMILY,
            fontLigatures: false,
            fontSize: LOG_FONT_SIZE_PX,
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineHeight: LOG_LINE_HEIGHT_PX,
            lineNumbers: "off",
            lineNumbersMinChars: 0,
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
