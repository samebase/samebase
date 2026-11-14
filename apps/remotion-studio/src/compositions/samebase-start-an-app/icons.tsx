import type { CSSProperties, ReactNode } from "react";

/*
The icons the real pages use. Samebase draws lucide-react icons and its own provider logos
(apps/samebase/src/components/repository-dashboard/RepositoryDashboardLogos.tsx); GitHub draws
Octicons. The paths are copied from those sets, so no package is needed here.
*/

function Lucide({
  size,
  color = "currentColor",
  style,
  children,
}: {
  size: number;
  color?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flex: "none", ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number; color?: string; style?: CSSProperties };

export const GithubIcon = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </Lucide>
);

export const CircleCheck = ({ size = 14, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Lucide>
);

export const Check = ({ size = 14, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M20 6 9 17l-5-5" />
  </Lucide>
);

/** lucide Loader2, turned by `angle` degrees. */
export const Loader = ({ size = 14, color, angle }: IconProps & { angle: number }) => (
  <Lucide size={size} color={color} style={{ transform: `rotate(${angle}deg)` }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </Lucide>
);

export const ExternalLink = ({ size = 14, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Lucide>
);

export const MoreHorizontal = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </Lucide>
);

export const ChevronDown = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="m6 9 6 6 6-6" />
  </Lucide>
);

export const ChevronRight = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="m9 18 6-6-6-6" />
  </Lucide>
);

export const ArrowLeft = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Lucide>
);

export const ArrowRight = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Lucide>
);

export const RotateCw = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </Lucide>
);

export const PanelLeft = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </Lucide>
);

export const Building = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </Lucide>
);

export const FolderPlus = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M12 10v6" />
    <path d="M9 13h6" />
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </Lucide>
);

export const User = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Lucide>
);

export const Pencil = ({ size = 16, color, style }: IconProps) => (
  <Lucide size={size} color={color} style={style}>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </Lucide>
);

/** The Convex logo, as RepositoryDashboardLogos.tsx draws it. */
export const ConvexLogo = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="47 43 54 60"
    width={size}
    height={size}
    style={{ display: "block", flex: "none" }}
    aria-hidden="true"
  >
    <path
      d="M82.2808 87.6516C89.652 86.8381 96.6012 82.9352 100.427 76.421C98.6156 92.533 80.8853 102.717 66.413 96.4643C65.0795 95.8897 63.9316 94.9339 63.1438 93.705C59.8915 88.6302 58.8224 82.1729 60.3585 76.3129C64.7475 83.8398 73.6717 88.4538 82.2808 87.6516Z"
      fill="#F3B01C"
    />
    <path
      d="M60.0895 71.5852C57.1016 78.4465 56.9722 86.4797 60.6353 93.0906C47.7442 83.453 47.8848 62.8294 60.4778 53.2885C61.6425 52.4067 63.0267 51.8833 64.4785 51.8036C70.4486 51.4907 76.5144 53.7835 80.7683 58.0561C72.1254 58.1415 63.7076 63.643 60.0895 71.5852Z"
      fill="#8D2676"
    />
    <path
      d="M84.9366 60.1673C80.5757 54.1253 73.7503 50.0119 66.2722 49.8868C80.7277 43.3669 98.5086 53.9375 100.444 69.5659C100.624 71.0167 100.388 72.4959 99.7409 73.8044C97.04 79.2547 92.032 83.4819 86.1801 85.0464C90.4678 77.144 89.9388 67.4893 84.9366 60.1673Z"
      fill="#EE342F"
    />
  </svg>
);

/**
The Samebase mark: a square with a one-third opening, from createCompactIdentitySvgMarkup in
apps/samebase/src/components/compactIdentitySvgAsset.ts (the 80% inline landing variant).
*/
export const SamebaseMark = ({
  size,
  color = "#394447",
  hole = "#ffffff",
}: {
  size: number;
  color?: string;
  hole?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    shapeRendering="crispEdges"
    style={{ display: "block", flex: "none" }}
    aria-hidden="true"
  >
    <rect width="48" height="48" fill={color} />
    <rect x="16" y="16" width="16" height="16" fill={hole} />
  </svg>
);

function Octicon({
  size,
  color = "currentColor",
  d,
  style,
}: {
  size: number;
  color?: string;
  d: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      style={{ display: "block", flex: "none", ...style }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const MarkGithub = ({ size = 32, color, style }: IconProps) => (
  <Octicon
    size={size}
    color={color}
    style={style}
    d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
  />
);

export const CheckCircleFill = ({ size = 16, color, style }: IconProps) => (
  <Octicon
    size={size}
    color={color}
    style={style}
    d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z"
  />
);

export const GitPullRequest = ({ size = 16, color, style }: IconProps) => (
  <Octicon
    size={size}
    color={color}
    style={style}
    d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
  />
);

export const PlayOcticon = ({ size = 16, color, style }: IconProps) => (
  <Octicon
    size={size}
    color={color}
    style={style}
    d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"
  />
);

export const CodeOcticon = ({ size = 16, color, style }: IconProps) => (
  <Octicon
    size={size}
    color={color}
    style={style}
    d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"
  />
);

/** GitHub's running step: a ring with a turning arc. */
export const RunningRing = ({ size = 16, angle }: { size?: number; angle: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block", flex: "none" }}>
    <circle
      cx="8"
      cy="8"
      r="6.5"
      fill="none"
      stroke="#d29922"
      strokeOpacity={0.35}
      strokeWidth={2}
    />
    <path
      d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
      fill="none"
      stroke="#d29922"
      strokeWidth={2}
      strokeLinecap="round"
      transform={`rotate(${angle} 8 8)`}
    />
  </svg>
);

/** GitHub's step that has not run yet, and the skipped one (a ring with a slash). */
export const PendingRing = ({
  size = 16,
  skipped = false,
}: {
  size?: number;
  skipped?: boolean;
}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block", flex: "none" }}>
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="#6e7681" strokeWidth={1.5} />
    {skipped ? <path d="M3.5 12.5 12.5 3.5" stroke="#6e7681" strokeWidth={1.5} /> : null}
  </svg>
);

const ARROW =
  "M5.17 5.18Q5 5 5 5.25L5 15.9Q5 16.4 5.5 16.46L8.6 16.86Q8.9 16.9 9.01 17.18L9.64 18.76Q9.95 19.55 10.76 19.29L10.84 19.26Q11.65 19 11.38 18.19L10.05 14.23Q9.95 13.95 10.25 13.91L12.8 13.57Q13.3 13.5 12.95 13.14Z";

/**
The macOS arrow, its tip on (x, y) in stage pixels. `scale` keeps it one size on screen while the
camera zooms; a press shrinks it a little, as the html-demo pointer does.
*/
export function Cursor({
  x,
  y,
  press,
  scale,
  opacity = 1,
}: {
  x: number;
  y: number;
  press: boolean;
  scale: number;
  opacity?: number;
}) {
  const s = scale * (press ? 0.98 : 1.15);
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      overflow="visible"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 50,
        opacity,
        transformOrigin: "5px 5px",
        transform: `translate(${x - 5}px, ${y - 5}px) scale(${s})`,
        filter: "drop-shadow(0 1px 1.2px rgba(0,0,0,0.35))",
      }}
      aria-hidden="true"
    >
      <path d={ARROW} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d={ARROW} fill="#000" />
    </svg>
  );
}
