// Captured from POST
// https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/workers
// on 2026-08-05 with the production create body and name `samebase app`.
// Cloudflare rejected the request and created no Worker.
export const observedInvalidWorkerNameResponse = {
  success: false,
  errors: [
    {
      code: 10016,
      message:
        "Invalid Worker name. Ensure the name is lowercase, alphanumeric, and contains no spaces or special characters except dashes.",
    },
  ],
  messages: [],
  result: null,
} as const;

// Captured from POST
// https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/workers
// on 2026-08-05 with previews enabled and a 55-character lowercase name.
// Cloudflare rejected the request and created no Worker.
export const observedPreviewWorkerNameTooLongResponse = {
  success: false,
  errors: [
    {
      code: 100315,
      message:
        "Script name is too long to be used with previews enabled. Script names with previews enabled cannot be longer than 54 characters.",
    },
  ],
  messages: [],
  result: null,
} as const;

// Captured from GET
// https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/workers/{worker_id}
// on 2026-08-05 after the temporary Worker was deleted and verified absent.
export const observedMissingWorkerResponse = {
  success: false,
  errors: [
    {
      code: 10007,
      message: "This Worker does not exist on your account.",
    },
  ],
  messages: [],
  result: null,
} as const;
