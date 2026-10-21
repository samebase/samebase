// Replies of the Alchemy state store functions (samebase/alchemy-convex at d20307f), captured on
// 2026-10-21 with `npx convex run` (Convex CLI 1.46.0) for samebase/base-alchemy, whose stack was
// then named `BaseAlchemy`. Values are real; the stages are trimmed to `main` and
// `renovate-hono-4-x-73ca1d1d` (the reply listed 6 stages).
// The store serves the same functions as internal queries through `POST /api/function`
// (https://github.com/samebase/alchemy-convex/pull/18).

/** `state:stages` for the stack, trimmed to two stages. */
export const observedAlchemyStages = ["main", "renovate-hono-4-x-73ca1d1d"];

/** `state:list` for each stage. */
export const observedAlchemyResourceFqns: Record<string, unknown> = {
  main: ["Deployment"],
  "renovate-hono-4-x-73ca1d1d": ["Deployment", "PreviewComment"],
};

/** `state:get` for each stage and fqn: the JSON text of Alchemy's `encodeState`. */
export const observedAlchemyResourceValues: Record<string, Record<string, unknown>> = {
  main: {
    Deployment:
      '{"status":"updated","fqn":"Deployment","logicalId":"Deployment","instanceId":"ac1ce491722f32f67587813138e02d7d","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938},"type":"prod","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"prod","name":"ideal-dolphin-15","reference":"production","url":"https://ideal-dolphin-15.convex.cloud","siteUrl":"https://ideal-dolphin-15.convex.site","hash":"795f23bfe121d30f87a82cb1ded561a9c6a1c6c18638f0cd688042fecbfd6c33","envNames":[]},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
  },
  "renovate-hono-4-x-73ca1d1d": {
    Deployment:
      '{"status":"created","fqn":"Deployment","logicalId":"Deployment","instanceId":"f81c7901bc5c927da723bf55e0fc1f5b","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938},"type":"preview","name":"renovate/hono-4.x","source":{"path":"./convex","command":["node","--run","deploy","--","--preview-name","renovate/hono-4.x"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"preview","name":"insightful-perch-284","reference":"preview/renovate-hono-4-x","previewName":"renovate/hono-4.x","url":"https://insightful-perch-284.convex.cloud","siteUrl":"https://insightful-perch-284.convex.site","hash":"7f9fb3efd8a0e32abd925e1433bab1f0efa1434f1e20705d7074c2ce1ba2a454","envNames":[]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
    PreviewComment:
      '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"04a27286f946b298b793f3265a99aeab","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"base-alchemy","issueNumber":7,"body":"Preview `renovate/hono-4.x`: https://insightful-perch-284.convex.site"},"attr":{"commentId":6288425980,"htmlUrl":"https://github.com/samebase/base-alchemy/pull/7#issuecomment-6288425980","updatedAt":"2026-10-20T10:02:28Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
  },
};

/** `state:getOutput` for each stage. */
export const observedAlchemyOutputs: Record<string, unknown> = {
  main: '{"url":"https://ideal-dolphin-15.convex.site"}',
  "renovate-hono-4-x-73ca1d1d": '{"url":"https://insightful-perch-284.convex.site"}',
};
