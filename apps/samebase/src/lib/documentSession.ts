import { createContext } from "react";

/**
Whether the server rendered this document as a signed-in user. The root route reads the token of the
render once: later navigations have no token, and a page keeps the sidebar source of its render, the
saved Convex state or the local copy, until the next document load.
*/
export const DocumentRenderedWithSessionContext = createContext(false);
