export const DAYTONA_PTY_WEBSOCKET_PROTOCOL = "X-Daytona-SDK-Version~0.143.0";

type DaytonaPtyControlStatus = "connected" | "error";

export type DaytonaPtyControlMessage = {
  type: "control";
  status: DaytonaPtyControlStatus;
  error?: string;
};

export type DaytonaPtyCloseMessage = {
  exitCode?: number;
  error?: string;
  exitReason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildAuthenticatedDaytonaPtyUrl(args: {
  webSocketUrl: string;
  previewToken: string;
}): string {
  const url = new URL(args.webSocketUrl);
  url.searchParams.set("DAYTONA_SANDBOX_AUTH_KEY", args.previewToken);
  return url.toString();
}

export function parseDaytonaPtyControlMessage(
  rawMessage: string,
): DaytonaPtyControlMessage | null {
  try {
    const parsed = JSON.parse(rawMessage);
    if (!isRecord(parsed)) {
      return null;
    }
    if (parsed.type !== "control") {
      return null;
    }
    if (parsed.status !== "connected" && parsed.status !== "error") {
      return null;
    }

    const error =
      typeof parsed.error === "string" && parsed.error.trim().length > 0
        ? parsed.error
        : undefined;

    return {
      type: "control",
      status: parsed.status,
      ...(error ? { error } : {}),
    };
  } catch {
    return null;
  }
}

export function parseDaytonaPtyCloseMessage(
  rawReason: string,
): DaytonaPtyCloseMessage | null {
  try {
    const parsed = JSON.parse(rawReason);
    if (!isRecord(parsed)) {
      return null;
    }

    const exitCode =
      typeof parsed.exitCode === "number" ? parsed.exitCode : undefined;
    const error =
      typeof parsed.error === "string" && parsed.error.trim().length > 0
        ? parsed.error
        : undefined;
    const exitReason =
      typeof parsed.exitReason === "string" &&
      parsed.exitReason.trim().length > 0
        ? parsed.exitReason
        : undefined;

    if (
      typeof exitCode === "undefined" &&
      typeof error === "undefined" &&
      typeof exitReason === "undefined"
    ) {
      return null;
    }

    return {
      ...(typeof exitCode === "number" ? { exitCode } : {}),
      ...(error ? { error } : {}),
      ...(exitReason ? { exitReason } : {}),
    };
  } catch {
    return null;
  }
}
