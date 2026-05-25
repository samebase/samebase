import { useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  PublicLayoutRouteChromeContext,
  type PublicLayoutRouteChromeConfig,
  type PublicLayoutRouteChromeStore,
} from "@/lib/publicLayoutRouteChromeStore";

export function PublicLayoutRouteChromeProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: PublicLayoutRouteChromeStore;
}) {
  return (
    <PublicLayoutRouteChromeContext.Provider value={store}>
      {children}
    </PublicLayoutRouteChromeContext.Provider>
  );
}

export function PublicLayoutRouteChrome({
  children,
  ...config
}: PublicLayoutRouteChromeConfig & { children?: ReactNode }) {
  const store = useContext(PublicLayoutRouteChromeContext);
  const idRef = useRef<symbol | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  if (idRef.current === null) {
    idRef.current = Symbol("public-layout-route-chrome");
  }
  const id = idRef.current;

  // The public route owns route-specific panes, while the parent route owns the
  // single workspace shell that keeps the URL editor focused across navigation.
  useLayoutEffect(() => {
    if (store === null) {
      return;
    }

    store.register(id, configRef.current);
    return () => {
      store.unregister(id);
    };
  }, [id, store]);

  useLayoutEffect(() => {
    if (store === null) {
      return;
    }

    store.update(id, config);
  });

  return <>{children}</>;
}
