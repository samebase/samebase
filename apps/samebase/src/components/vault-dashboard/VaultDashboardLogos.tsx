import { GitHubLogoIcon } from "@/lib/radixIcons";
import { GitPullRequestCreateArrow, GitPullRequestDraft } from "lucide-react";
import { LOGO_IDENTITY_EDIT_MARK_SVG_URL } from "@/components/logo/logoStaticSvgContract";

const NOTER_LOGO_ICON_SRC = LOGO_IDENTITY_EDIT_MARK_SVG_URL;

export function GitHubProviderLogo() {
  return <GitHubLogoIcon className="h-4 w-4" />;
}

export function NoterLogoMark() {
  return (
    <span className="inline-flex items-center justify-center">
      <img
        src={NOTER_LOGO_ICON_SRC}
        alt=""
        aria-hidden="true"
        className="h-4 w-4"
        draggable={false}
      />
    </span>
  );
}

export function PullRequestStateLogo({ isDraft }: { isDraft: boolean }) {
  const Icon = isDraft ? GitPullRequestDraft : GitPullRequestCreateArrow;

  return <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />;
}

export function ConvexProviderLogo() {
  return (
    <span className="inline-flex items-center justify-center">
      <svg
        aria-hidden="true"
        viewBox="47 43 54 60"
        className="h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
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
    </span>
  );
}

export function CloudflareProviderLogo() {
  return (
    <span className="inline-flex items-center justify-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 32"
        className="h-2.5 w-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="#FAAE40"
          d="M14.2 25.3a4.8 4.8 0 0 1 4.8-4.8c.4 0 .8 0 1.2.1a7.4 7.4 0 0 1 7.1-5.4c3 0 5.8 1.8 7 4.5.4-.1.9-.2 1.4-.2 2.2 0 4.1 1.6 4.5 3.8H14.2Z"
        />
        <path
          fill="#F38020"
          d="M9.2 25.3a7 7 0 0 1 7-7c.6 0 1.3.1 1.9.2A11.6 11.6 0 0 1 29.2 9c5.2 0 9.8 3.2 11.7 8a7.5 7.5 0 0 1 1.3-.1c3.8 0 7 2.9 7.4 6.6l.1 1.8H9.2v-.1Z"
        />
        <path
          fill="#F38020"
          d="M43.5 22.7a5.3 5.3 0 0 1 5.2-4.6c2.8 0 5.1 2.1 5.4 4.8l.2 2.4h-10l-.8-2.6Z"
        />
      </svg>
    </span>
  );
}
