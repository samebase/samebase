export const APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME =
  "text-base text-primary underline underline-offset-4";

export const APP_SIDEBAR_CURRENT_LABEL_CLASS_NAME = "app-sidebar-current-label";

export const APP_SIDEBAR_NAVIGATION_LINK_PROPS = {
  activeOptions: { exact: true, includeSearch: false },
  activeProps: { className: APP_SIDEBAR_CURRENT_LABEL_CLASS_NAME },
};
