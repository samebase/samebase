type PaddleEnvironment = "sandbox" | "live";
type PaddleEventCallback = (event: unknown) => void;

type PaddlePreviewItem = {
  priceId: string;
  quantity: number;
};

type PaddleCheckoutCustomer = {
  email?: string;
};

type PaddleCheckoutSettings = {
  displayMode?: "overlay";
  successUrl?: string;
};

type PaddleUpdatePayload = {
  eventCallback?: PaddleEventCallback;
};

type PaddleInitializePayload = {
  token: string;
  eventCallback?: PaddleEventCallback;
};

type PaddlePricePreviewPayload = {
  items: PaddlePreviewItem[];
};

type PaddleCheckoutOpenPayload = {
  items: PaddlePreviewItem[];
  customer?: PaddleCheckoutCustomer;
  customData?: Record<string, string>;
  settings?: PaddleCheckoutSettings;
};

type PaddleClient = {
  Environment?: {
    set: (environment: PaddleEnvironment) => void;
  };
  Initialize: (payload: PaddleInitializePayload) => void;
  Update?: (payload: PaddleUpdatePayload) => void;
  PricePreview: (payload: PaddlePricePreviewPayload) => Promise<unknown>;
  Checkout: {
    open: (payload: PaddleCheckoutOpenPayload) => Promise<unknown>;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleClient;
  }
}

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

let paddleScriptPromise: Promise<PaddleClient | null> | null = null;
let initializedToken: string | null = null;

function loadPaddleScript(): Promise<PaddleClient | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (window.Paddle) {
    return Promise.resolve(window.Paddle);
  }

  if (paddleScriptPromise) {
    return paddleScriptPromise;
  }

  paddleScriptPromise = new Promise((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${PADDLE_JS_SRC}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        resolve(window.Paddle ?? null);
      });
      existingScript.addEventListener("error", () => resolve(null));
      return;
    }

    const script = document.createElement("script");
    script.src = PADDLE_JS_SRC;
    script.async = true;
    script.onload = () => resolve(window.Paddle ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return paddleScriptPromise;
}

export async function initializePaddleClient(args: {
  environment: PaddleEnvironment;
  clientToken: string;
  eventCallback?: PaddleEventCallback;
}): Promise<PaddleClient | null> {
  if (!args.clientToken) {
    return null;
  }

  const paddle = await loadPaddleScript();
  if (!paddle) {
    return null;
  }

  if (args.environment === "sandbox") {
    paddle.Environment?.set("sandbox");
  }

  if (initializedToken === args.clientToken) {
    if (args.eventCallback) {
      paddle.Update?.({ eventCallback: args.eventCallback });
    }
    return paddle;
  }

  paddle.Initialize({
    token: args.clientToken,
    eventCallback: args.eventCallback,
  });
  initializedToken = args.clientToken;

  return paddle;
}
