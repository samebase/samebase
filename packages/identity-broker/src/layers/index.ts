// The registration layers, for the `registration` option of `identityBroker`.
export { githubActions } from "./github/routes.ts";
export { keys, type Key } from "./stack/routes.ts";
export { metadataDocuments, type MetadataOptions } from "./metadata/registration.ts";
