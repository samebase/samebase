export const publicMediaManifest = {
  landingFounderDemo: {
    bucket: "samebase-public-media",
    key: "landing/founder-demo-v2.mp4",
    publicUrl: "https://media.samebase.com/landing/founder-demo-v2.mp4",
    byteLength: 13_946_814,
    contentType: "video/mp4",
    contentDisposition: "inline",
    cacheControl: "public, max-age=31536000, immutable",
    etag: '"f9b9adad246547e7227eba9aee9f1dbb"',
  },
  landingFounderDemoPoster: {
    bucket: "samebase-public-media",
    key: "landing/founder-demo-v1-poster.webp",
    publicUrl: "https://media.samebase.com/landing/founder-demo-v1-poster.webp",
    byteLength: 51_428,
    contentType: "image/webp",
    contentDisposition: "inline",
    cacheControl: "public, max-age=31536000, immutable",
    etag: '"30020f575ac71e99a6c9f4ee7166a94a"',
  },
} as const;
