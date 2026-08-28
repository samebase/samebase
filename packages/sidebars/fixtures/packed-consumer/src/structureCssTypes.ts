// @ts-expect-error The structural stylesheet is a side-effect-only module.
import sidebarLayoutStructureCss from "@samebase/sidebars/structure.css";

type UnsupportedStructureCssDefault = typeof sidebarLayoutStructureCss;

export type { UnsupportedStructureCssDefault };
