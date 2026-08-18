export const publicMediaManifest = {
  landingFounderDemo: {
    bucket: "samebase-public-media",
    key: "landing/founder-demo-v1.mp4",
    publicUrl: "https://media.samebase.com/landing/founder-demo-v1.mp4",
    byteLength: 14_728_042,
    contentType: "video/mp4",
    contentDisposition: "inline",
    cacheControl: "public, max-age=31536000, immutable",
    etag: '"4f6518459929b585a67037ab8847f677"',
    source: {
      repository: "https://github.com/samebase/samebase",
      commit: "de26ca14c5bfb565f6d13392cfcf4f6c366df012",
      composition: "FounderDemoYouTube",
    },
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
    source: {
      repository: "https://github.com/samebase/samebase",
      commit: "de26ca14c5bfb565f6d13392cfcf4f6c366df012",
      composition: "FounderDemoYouTube",
    },
  },
} as const;
