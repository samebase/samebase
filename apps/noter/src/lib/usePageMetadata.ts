import { useEffect } from "react";

import { applyPageMetadata, type PageMetadata } from "./pageMetadata";

export function usePageMetadata(metadata: PageMetadata): void {
  useEffect(() => {
    applyPageMetadata(metadata);
  }, [metadata]);
}
