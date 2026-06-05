const PUBLIC_DASHBOARD_AUTH_RETURN_KEY = "noter_public_dashboard_auth_return";
const PUBLIC_DASHBOARD_AUTH_RETURN_MAX_AGE_MS = 10 * 60 * 1000;

export type PublicDashboardAuthReturnMode = "top-level" | "popup";

type PublicDashboardAuthReturnMarker = {
  mode: PublicDashboardAuthReturnMode;
  startedAt: number;
};

function readSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parsePublicDashboardAuthReturnMarker(
  rawMarker: string,
): PublicDashboardAuthReturnMarker | null {
  const separatorIndex = rawMarker.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }
  if (rawMarker.indexOf(":", separatorIndex + 1) >= 0) {
    return null;
  }
  const mode = rawMarker.slice(0, separatorIndex);
  const startedAtText = rawMarker.slice(separatorIndex + 1);
  if (mode !== "top-level" && mode !== "popup") {
    return null;
  }

  const startedAt = Number(startedAtText);
  if (!Number.isFinite(startedAt)) {
    return null;
  }

  return { mode, startedAt };
}

export function markPublicDashboardAuthReturnStarted(
  mode: PublicDashboardAuthReturnMode,
  now = Date.now(),
) {
  const storage = readSessionStorage();
  if (!storage) {
    return;
  }

  storage.setItem(PUBLIC_DASHBOARD_AUTH_RETURN_KEY, `${mode}:${now}`);
}

export function clearPublicDashboardAuthReturn() {
  const storage = readSessionStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(PUBLIC_DASHBOARD_AUTH_RETURN_KEY);
}

export function consumePublicDashboardAuthReturnMode(
  now = Date.now(),
): PublicDashboardAuthReturnMode | null {
  const storage = readSessionStorage();
  if (!storage) {
    return null;
  }

  const rawMarker = storage.getItem(PUBLIC_DASHBOARD_AUTH_RETURN_KEY);
  if (!rawMarker) {
    return null;
  }

  storage.removeItem(PUBLIC_DASHBOARD_AUTH_RETURN_KEY);
  const marker = parsePublicDashboardAuthReturnMarker(rawMarker);
  if (!marker) {
    return null;
  }
  if (now < marker.startedAt) {
    return null;
  }
  if (now - marker.startedAt > PUBLIC_DASHBOARD_AUTH_RETURN_MAX_AGE_MS) {
    return null;
  }

  return marker.mode;
}
