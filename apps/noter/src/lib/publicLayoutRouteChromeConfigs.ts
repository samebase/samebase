import type { PublicLayoutRouteChromeSnapshot } from "@/lib/publicLayoutRouteChromeStore";

export const LOCAL_STORAGE_PUBLIC_LAYOUT_CHROME = {
  dataTestId: "local-storage-workspace",
  defaultLeftOpen: true,
  left: {},
  leftToggleVisibility: "desktop",
} satisfies PublicLayoutRouteChromeSnapshot;

export const LOGO_PREVIEW_PUBLIC_LAYOUT_CHROME = {
  defaultLeftOpen: true,
  defaultMobilePane: "left",
  left: {},
  leftToggleVisibility: "desktop",
  main: {
    headerTestId: "logo-preview-main-header",
  },
} satisfies PublicLayoutRouteChromeSnapshot;
