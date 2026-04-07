import App from "./App";

export default function Component() {
  // Keep `/` on a real framework route so it can be prerendered before the
  // remaining component-route tree is migrated out of App.
  return <App />;
}
