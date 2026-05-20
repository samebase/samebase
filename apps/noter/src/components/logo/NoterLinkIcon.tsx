import { DEFAULT_STATIC_LOGO_SVG_URL } from "@/components/logo/logoStaticSvgContract";

export function NoterLinkIcon() {
  return (
    <img
      aria-hidden="true"
      alt=""
      src={DEFAULT_STATIC_LOGO_SVG_URL}
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      className="h-5 w-5 shrink-0"
    />
  );
}
