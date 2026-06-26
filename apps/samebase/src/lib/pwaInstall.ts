export const PWA_INSTALL_AVAILABILITY_EVENT_NAME = "samebase:pwa-install-availability";

export type PwaInstallStatus = "ios-safari" | "prompt" | "unavailable";

type PwaInstallPromptResult =
  | {
      kind: "prompted";
      outcome: BeforeInstallPromptOutcome;
    }
  | {
      kind: "unavailable";
    };

const IOS_DEVICE_USER_AGENT_PATTERN = /iPad|iPhone|iPod/;
const IOS_BROWSER_USER_AGENT_EXCLUSION_PATTERN = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i;

function isBrowserRuntime() {
  return typeof window !== "undefined";
}

function isStandaloneDisplayMode() {
  if (!isBrowserRuntime()) {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
  );
}

function isIosDevice() {
  const { maxTouchPoints, platform, userAgent } = window.navigator;

  return (
    IOS_DEVICE_USER_AGENT_PATTERN.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

function isIosSafari() {
  const { userAgent, vendor } = window.navigator;

  return (
    isIosDevice() &&
    vendor.includes("Apple") &&
    userAgent.includes("Safari") &&
    !IOS_BROWSER_USER_AGENT_EXCLUSION_PATTERN.test(userAgent)
  );
}

export function readPwaInstallStatus(): PwaInstallStatus {
  if (!isBrowserRuntime()) {
    return "unavailable";
  }

  if (window.samebasePwaInstallPromptEvent) {
    return "prompt";
  }

  if (!isStandaloneDisplayMode() && isIosSafari()) {
    return "ios-safari";
  }

  return "unavailable";
}

export function subscribePwaInstallAvailability(onStoreChange: () => void) {
  if (!isBrowserRuntime()) {
    return () => {};
  }

  const timeoutId = window.setTimeout(onStoreChange, 0);

  window.addEventListener(PWA_INSTALL_AVAILABILITY_EVENT_NAME, onStoreChange);
  window.addEventListener("appinstalled", onStoreChange);

  return () => {
    window.clearTimeout(timeoutId);
    window.removeEventListener(PWA_INSTALL_AVAILABILITY_EVENT_NAME, onStoreChange);
    window.removeEventListener("appinstalled", onStoreChange);
  };
}

export async function promptForPwaInstall(): Promise<PwaInstallPromptResult> {
  if (!isBrowserRuntime()) {
    return { kind: "unavailable" };
  }

  const promptEvent = window.samebasePwaInstallPromptEvent;
  if (!promptEvent) {
    return { kind: "unavailable" };
  }

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    return {
      kind: "prompted",
      outcome: choice.outcome,
    };
  } finally {
    window.samebasePwaInstallPromptEvent = null;
    window.dispatchEvent(new Event(PWA_INSTALL_AVAILABILITY_EVENT_NAME));
  }
}
