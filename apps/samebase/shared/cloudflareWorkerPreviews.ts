export const WORKER_PREVIEWS_MIGRATION_URL =
  "https://samebase.com/docs/cloudflare-setup#worker-previews";

export const WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE = `This Worker does not use native Worker Previews. Update the repository and Cloudflare settings before configuring Builds or rotating Convex deploy keys. Migration steps: ${WORKER_PREVIEWS_MIGRATION_URL}`;
