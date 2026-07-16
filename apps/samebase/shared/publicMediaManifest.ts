export const publicMediaManifest = {
  landingTicTacToeCodex: {
    bucket: "samebase-public-media",
    key: "landing/tic-tac-toe-codex-v1.mp4",
    publicUrl: "https://media.samebase.com/landing/tic-tac-toe-codex-v1.mp4",
    byteLength: 10_487_434,
    contentType: "video/mp4",
    contentDisposition: "inline",
    cacheControl: "public, max-age=31536000, immutable",
    etag: '"f799fe79f24d281cae1ed46abf9dac2c"',
    source: {
      repository: "https://github.com/samebase/remotion-video-workbench",
      commit: "dd353dc1a215650e786e1ea32a77902723d4db0d",
      composition: "TicTacToeRecording",
    },
  },
} as const;
