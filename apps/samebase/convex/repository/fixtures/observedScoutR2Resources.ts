/**
Scout bucket metadata read through Cloudflare's GET /accounts/{account}/r2/buckets/{bucket}
on 2026-10-22, mapped to Alchemy beta.83's bucket attributes. These are not captured Alchemy rows.
Only the attributes used by the repository overview are included.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Cloudflare/R2/Bucket.ts#L263-L280
*/
export const observedScoutR2Resources = [
  { fqn: "Workspaces", bucketName: "scout-workspaces" },
  { fqn: "WorkspacesProd", bucketName: "scout-workspaces-prod" },
  { fqn: "PublicMedia", bucketName: "scout-public-media" },
].map(({ fqn, bucketName }) => ({
  fqn,
  value: JSON.stringify({
    resourceType: "Cloudflare.R2.Bucket",
    attr: {
      bucketName,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      jurisdiction: "default",
    },
  }),
}));
