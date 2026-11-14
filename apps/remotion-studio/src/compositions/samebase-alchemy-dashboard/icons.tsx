// Icons. The Convex logo, the R2 and Worker icons and the Samebase mark are copied from the app:
// apps/samebase/src/components/repository-dashboard/RepositoryDashboardLogos.tsx,
// apps/samebase/src/components/resourceTypePresentation.tsx (Cloudflare icons, CC BY 4.0) and
// apps/samebase/public/brand/icon/compact-v1-landing-inline-80.svg.

export function ConvexLogo({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="47 43 54 60" width={size} height={size}>
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
}

export function WorkerIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 49" width={size} height={size} fill="#F38020">
      <path d="m18.63 37.418-9.645-12.9 9.592-12.533-1.852-2.527L5.917 23.595l-.015 1.808 10.86 14.542z" />
      <path d="M21.997 6.503h-3.712l13.387 18.3-13.072 17.7h3.735L35.4 24.81z" />
      <path d="M29.175 6.503h-3.758l13.598 18.082-13.598 17.918h3.765l12.908-17.01v-1.808z" />
    </svg>
  );
}

export function R2Icon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" width={size} height={size} fill="#F38020">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M30.289 6.423c-2.43-.813-5.958-1.362-9.977-1.362-4.018 0-7.545.549-9.976 1.362-1.228.41-2.033.842-2.48 1.195q-.14.111-.204.18c.052.171.196.395.562.67.524.394 1.372.783 2.563 1.119 2.368.666 5.731 1.023 9.536 1.023s7.167-.357 9.535-1.023c1.191-.336 2.04-.725 2.563-1.119.366-.275.51-.499.562-.67a2 2 0 0 0-.204-.18c-.447-.353-1.252-.784-2.48-1.195m-20.24 5.624c-.885-.25-1.71-.552-2.424-.922v4.393c0 .196.097.514.625.941.535.433 1.391.869 2.576 1.252 2.36.764 5.71 1.222 9.486 1.222 3.778 0 7.128-.458 9.487-1.222 1.185-.383 2.041-.82 2.576-1.252.528-.427.625-.745.625-.94v-4.394c-.715.37-1.539.673-2.424.922-2.7.76-6.336 1.124-10.264 1.124s-7.564-.364-10.263-1.124m25.576 3.471V7.622c0-2.829-6.856-5.122-15.313-5.122C11.857 2.5 5 4.793 5 7.622v24.756c0 2.829 6.856 5.122 15.313 5.122 8.456 0 15.312-2.293 15.312-5.122zM33 19.134c-.7.393-1.505.726-2.375 1.008-2.708.877-6.358 1.352-10.313 1.352-3.954 0-7.604-.475-10.312-1.352-.87-.282-1.676-.615-2.375-1.008v4.28c0 .196.097.514.625.942.535.432 1.391.868 2.576 1.252 2.36.763 5.71 1.221 9.486 1.221 3.778 0 7.128-.458 9.487-1.221 1.185-.384 2.041-.82 2.576-1.252.528-.428.625-.746.625-.941v-4.28Zm-23 8.904c-.87-.281-1.676-.615-2.375-1.007v5.143c.044.048.116.117.231.208.447.353 1.252.785 2.48 1.195 2.43.813 5.958 1.362 9.976 1.362s7.546-.549 9.977-1.362c1.228-.41 2.033-.842 2.48-1.195a2 2 0 0 0 .231-.208v-5.143c-.7.392-1.505.726-2.375 1.007-2.708.877-6.358 1.352-10.313 1.352-3.954 0-7.604-.475-10.312-1.352m23.06 4.06-.01.016zm-25.495 0 .01.016zm3.997-15.726c.725 0 1.313-.573 1.313-1.28s-.588-1.281-1.313-1.281c-.724 0-1.312.573-1.312 1.28s.588 1.281 1.313 1.281Zm1.313 6.83c0 .706-.588 1.28-1.313 1.28-.724 0-1.312-.574-1.312-1.28 0-.708.588-1.281 1.313-1.281.724 0 1.312.573 1.312 1.28Zm-1.313 9.176c.725 0 1.313-.573 1.313-1.28s-.588-1.28-1.313-1.28c-.724 0-1.312.572-1.312 1.28 0 .707.588 1.28 1.313 1.28Z"
      />
    </svg>
  );
}

/** The Samebase mark: a square with a square hole. */
export function SamebaseMark({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="6 6 48 48" width={size} height={size}>
      <path d="M6 6h48v48H6z M22 22h16v16H22z" fill={color} fillRule="evenodd" />
    </svg>
  );
}

const stroke = (color: string, width: number) =>
  ({
    fill: "none",
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }) as const;

/** A key, for the identity hub client (lucide KeyRound). */
export function KeyIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 1.8)}>
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" fill={color} />
    </svg>
  );
}

/** A globe, for the site (lucide Globe). */
export function GlobeIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 1.8)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function ExternalIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 2)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function CheckCircle({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 2)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** A ring with a gap that turns with `turn` (0 to 1): a step or a resource at work. */
export function Spinner({ size, color, turn }: { size: number; color: string; turn: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}>
      <g transform={`rotate(${turn * 360} 12 12)`}>
        <circle cx="12" cy="12" r="9" {...stroke(color, 2.4)} strokeDasharray="42 100" />
      </g>
    </svg>
  );
}

export function PendingCircle({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}>
      <circle cx="12" cy="12" r="9" {...stroke(color, 2)} />
    </svg>
  );
}

/** GitHub's mark (lucide Github, simplified). */
export function GitHubIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 1.8)}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

/** An organization (lucide Building2), as the sidebar shows an owner. */
export function OrganizationIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 1.8)}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function ChevronDown({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 2)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** The GitHub Actions workflow mark: a play button in a circle. */
export function WorkflowIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} {...stroke(color, 1.8)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m10 8 6 4-6 4Z" />
    </svg>
  );
}
