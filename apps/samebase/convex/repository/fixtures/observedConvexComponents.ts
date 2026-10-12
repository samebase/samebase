// Captured on 2026-10-12 with `/api/query_batch` from a local Convex backend
// (precompiled-2026-10-06-a3538c6) running the Samebase app, which mounts `workflow` (with its nested
// `workpool`) and `mail`. The root app entry of `modules:listForAllComponents` keeps only `http.js`;
// the reader skips the root app.

/** `_system/frontend/components:list` */
export const observedConvexComponentsList = [
  {
    args: {},
    httpPrefix: null,
    id: "m0225s8f0jeedvq61vgxp7c6qx8g54zc",
    name: null,
    path: "",
    state: "active",
  },
  {
    args: {},
    httpPrefix: null,
    id: "m02ebtw0m7ky3x0rdj6zeytkds8g5t2b",
    name: "workflow",
    path: "workflow",
    state: "active",
  },
  {
    args: {},
    httpPrefix: null,
    id: "m02f5czs7a0jgvf5jx9thy07gn8g5r6r",
    name: "workpool",
    path: "workflow/workpool",
    state: "active",
  },
  {
    args: {},
    httpPrefix: null,
    id: "m022zrs6f3rfbcxr8fqnkqpswd8g4778",
    name: "mail",
    path: "mail",
    state: "active",
  },
];

/** `_system/frontend/modules:listForAllComponents` */
export const observedConvexModulesForAllComponents = [
  [
    null,
    [
      [
        "http.js",
        {
          functions: [
            {
              name: "GET /.well-known/jwks.json",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /.well-known/oauth-authorization-server",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /.well-known/oauth-authorization-server/mcp",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /.well-known/oauth-protected-resource",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /.well-known/oauth-protected-resource/mcp",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /.well-known/openid-configuration",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "DELETE /mcp",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /mcp",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "POST /mcp",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /oauth/cloudflare-mcp/callback",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /oauth/cloudflare/callback",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /oauth/convex/callback",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /oauth/github/callback",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /oauth/mcp/authorize",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "POST /oauth/mcp/register",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "POST /oauth/mcp/token",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "POST /webhooks/polar",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /api/auth/callback/*",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "GET /api/auth/signin/*",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "POST /api/auth/callback/*",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 22,
              name: "GET /.well-known/openai-apps-challenge",
              udfType: "HttpAction",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg2c57kkyevx4gr57gqbzbkf518g5t2y",
        },
      ],
    ],
  ],
  [
    "m02ebtw0m7ky3x0rdj6zeytkds8g5t2b",
    [
      [
        "convex.config.js",
        {
          functions: [],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "event.js",
        {
          functions: [
            {
              name: "create",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "send",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "journal.js",
        {
          functions: [
            {
              lineno: 37,
              name: "load",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 92,
              name: "startSteps",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "logging.js",
        {
          functions: [],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "model.js",
        {
          functions: [],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "oversizedValues.js",
        {
          functions: [],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "pool.js",
        {
          functions: [
            {
              name: "handlerOnComplete",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              name: "nestedWorkflowOnComplete",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              name: "onComplete",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "schema.js",
        {
          functions: [],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "utils.js",
        {
          functions: [
            {
              name: "updateConfig",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
      [
        "workflow.js",
        {
          functions: [
            {
              name: "cancel",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "cleanup",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "cleanupContinue",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              name: "complete",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "create",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "getStatus",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "list",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "listByName",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "listSteps",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "restart",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              name: "sleep",
              udfType: "Query",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2f5m20b8dk0xj33g7cy2236x8g5fk2",
        },
      ],
    ],
  ],
  [
    "m02f5czs7a0jgvf5jx9thy07gn8g5r6r",
    [
      [
        "complete.js",
        {
          functions: [
            {
              name: "complete",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "config.js",
        {
          functions: [
            {
              name: "update",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "convex.config.js",
        {
          functions: [],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "crons.js",
        {
          cronSpecs: [
            [
              "healthcheck",
              {
                cronSchedule: {
                  seconds: "1800",
                  type: "interval",
                },
                udfArgs: "W3t9XQ==",
                udfPath: "crons.js:healthcheck",
              },
            ],
          ],
          functions: [
            {
              lineno: 11,
              name: "healthcheck",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "danger.js",
        {
          functions: [
            {
              lineno: 15,
              name: "clearPending",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 61,
              name: "clearOldWork",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "errors.js",
        {
          functions: [],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "future.js",
        {
          functions: [],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "kick.js",
        {
          functions: [
            {
              name: "forceKick",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "lib.js",
        {
          functions: [
            {
              lineno: 54,
              name: "enqueue",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 130,
              name: "enqueueBatch",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 142,
              name: "cancel",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 163,
              name: "cancelAll",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 205,
              name: "status",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 235,
              name: "statusBatch",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "logging.js",
        {
          functions: [],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "loop.js",
        {
          functions: [
            {
              name: "getPending",
              udfType: "Query",
              visibility: {
                kind: "internal",
              },
            },
            {
              name: "main",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              name: "updateRunStatus",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "recovery.js",
        {
          functions: [
            {
              lineno: 41,
              name: "recover",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "schema.js",
        {
          functions: [],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "shared.js",
        {
          functions: [],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "stats.js",
        {
          functions: [
            {
              name: "calculateBacklogAndReport",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              name: "diagnostics",
              udfType: "Query",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
      [
        "worker.js",
        {
          functions: [
            {
              lineno: 31,
              name: "runMutationWrapper",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 91,
              name: "runActionWrapper",
              udfType: "Action",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 146,
              name: "getWorkArgs",
              udfType: "Query",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
        },
      ],
    ],
  ],
  [
    "m022zrs6f3rfbcxr8fqnkqpswd8g4778",
    [
      [
        "bootstrap.js",
        {
          functions: [
            {
              lineno: 10,
              name: "ensureInboxes",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "cloudflareEmail.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "convex.config.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "delivery.js",
        {
          functions: [
            {
              lineno: 44,
              name: "get",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 55,
              name: "prepare",
              udfType: "Query",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 72,
              name: "claim",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 102,
              name: "rejectPreparation",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 125,
              name: "markUnknownIfStale",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 144,
              name: "finish",
              udfType: "Mutation",
              visibility: {
                kind: "internal",
              },
            },
            {
              lineno: 213,
              name: "send",
              udfType: "Action",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "inboxes.js",
        {
          functions: [
            {
              lineno: 24,
              name: "list",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 37,
              name: "create",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "ingress.js",
        {
          functions: [
            {
              lineno: 29,
              name: "begin",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 84,
              name: "complete",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 196,
              name: "dispatchReceived",
              udfType: "Action",
              visibility: {
                kind: "internal",
              },
            },
          ],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "mail.js",
        {
          functions: [
            {
              lineno: 70,
              name: "getMessage",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 82,
              name: "listHistory",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 136,
              name: "listThreads",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 175,
              name: "listMessages",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 203,
              name: "getThread",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 224,
              name: "markThreadRead",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 436,
              name: "queueSend",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
            {
              lineno: 445,
              name: "queueReply",
              udfType: "Mutation",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "mailProtocol.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "messageTypes.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "objects.js",
        {
          functions: [
            {
              lineno: 12,
              name: "resolve",
              udfType: "Query",
              visibility: {
                kind: "public",
              },
            },
          ],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "outboundAttachments.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "schema.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
      [
        "text.js",
        {
          functions: [],
          sourcePackageId: "hg281bwn40xargbv35vhba5fdd8g5m4c",
        },
      ],
    ],
  ],
];

/** `_system/frontend/getTableMapping:default` by `componentId` */
export const observedConvexTableMappings: Record<string, unknown> = {
  m02ebtw0m7ky3x0rdj6zeytkds8g5t2b: {
    "539": "_scheduled_jobs",
    "540": "_file_storage",
    "10001": "events",
    "10002": "steps",
    "10003": "workflows",
    "10004": "config",
    "10005": "onCompleteFailures",
  },
  m02f5czs7a0jgvf5jx9thy07gn8g5r6r: {
    "539": "_scheduled_jobs",
    "540": "_file_storage",
    "10001": "pendingCancelation",
    "10002": "pendingCompletion",
    "10003": "pendingStart",
    "10004": "globals",
    "10005": "internalState",
    "10006": "payload",
    "10007": "runStatus",
    "10008": "work",
  },
  m022zrs6f3rfbcxr8fqnkqpswd8g4778: {
    "539": "_scheduled_jobs",
    "540": "_file_storage",
    "10001": "emailAttachments",
    "10002": "emailBodies",
    "10003": "emailMessages",
    "10004": "emailThreads",
    "10005": "inboxes",
    "10006": "ingressReceipts",
    "10007": "mailDomains",
  },
};

/** `_system/frontend/fileStorageV2:numFiles` by `componentId` */
export const observedConvexFileCounts: Record<string, unknown> = {
  m02ebtw0m7ky3x0rdj6zeytkds8g5t2b: 0,
  m02f5czs7a0jgvf5jx9thy07gn8g5r6r: 0,
  m022zrs6f3rfbcxr8fqnkqpswd8g4778: 0,
};

/** `_system/frontend/tableSize:default` by `componentId` and `tableName` */
export const observedConvexTableSizes: Record<string, Record<string, unknown>> = {
  m02ebtw0m7ky3x0rdj6zeytkds8g5t2b: {
    events: 0,
    steps: 4,
    workflows: 1,
    config: 1,
    onCompleteFailures: 0,
  },
  m02f5czs7a0jgvf5jx9thy07gn8g5r6r: {
    pendingCancelation: 0,
    pendingCompletion: 0,
    pendingStart: 0,
    globals: 1,
    internalState: 1,
    payload: 0,
    runStatus: 1,
    work: 0,
  },
  m022zrs6f3rfbcxr8fqnkqpswd8g4778: {
    emailAttachments: 0,
    emailBodies: 0,
    emailMessages: 0,
    emailThreads: 0,
    inboxes: 0,
    ingressReceipts: 0,
    mailDomains: 0,
  },
};
