// Captured on 2026-10-12 with `/api/query_batch` from a local Convex backend
// (precompiled-2026-10-06-a3538c6) running the Samebase app. Values are real; entries are trimmed to
// what the test reads: the `mail` component is left out, the root app keeps no modules, `workflow`
// keeps `workflow.js`, `workpool` keeps `complete.js` and `crons.js`, and each schema keeps one
// table (`config` and `pendingStart`).

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
];

/** `_system/frontend/modules:listForAllComponents` */
export const observedConvexModulesForAllComponents = [
  [null, []],
  [
    "m02ebtw0m7ky3x0rdj6zeytkds8g5t2b",
    [
      [
        "workflow.js",
        {
          functions: [
            { name: "cancel", udfType: "Mutation", visibility: { kind: "public" } },
            { name: "cleanup", udfType: "Mutation", visibility: { kind: "public" } },
            { name: "cleanupContinue", udfType: "Mutation", visibility: { kind: "internal" } },
            { name: "complete", udfType: "Mutation", visibility: { kind: "public" } },
            { name: "create", udfType: "Mutation", visibility: { kind: "public" } },
            { name: "getStatus", udfType: "Query", visibility: { kind: "public" } },
            { name: "list", udfType: "Query", visibility: { kind: "public" } },
            { name: "listByName", udfType: "Query", visibility: { kind: "public" } },
            { name: "listSteps", udfType: "Query", visibility: { kind: "public" } },
            { name: "restart", udfType: "Mutation", visibility: { kind: "public" } },
            { name: "sleep", udfType: "Query", visibility: { kind: "internal" } },
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
          functions: [{ name: "complete", udfType: "Mutation", visibility: { kind: "internal" } }],
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
                cronSchedule: { seconds: "1800", type: "interval" },
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
              visibility: { kind: "internal" },
            },
          ],
          sourcePackageId: "hg2631bjmb53bk7vmh8tkjd8hh8g4fgs",
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
};

/** `_system/frontend/fileStorageV2:numFiles` by `componentId` */
export const observedConvexFileCounts: Record<string, unknown> = {
  m02ebtw0m7ky3x0rdj6zeytkds8g5t2b: 0,
  m02f5czs7a0jgvf5jx9thy07gn8g5r6r: 0,
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
};

/** The parsed `active` JSON of `_system/frontend/getSchemas:default` by `componentId` */
export const observedConvexSchemas: Record<string, unknown> = {
  m02ebtw0m7ky3x0rdj6zeytkds8g5t2b: {
    tables: [
      {
        tableName: "config",
        indexes: [],
        stagedDbIndexes: [],
        searchIndexes: [],
        stagedSearchIndexes: [],
        vectorIndexes: [],
        stagedVectorIndexes: [],
        documentType: {
          type: "object",
          value: {
            logLevel: {
              fieldType: {
                type: "union",
                value: [
                  { type: "literal", value: "DEBUG" },
                  { type: "literal", value: "TRACE" },
                  { type: "literal", value: "INFO" },
                  { type: "literal", value: "REPORT" },
                  { type: "literal", value: "WARN" },
                  { type: "literal", value: "ERROR" },
                ],
              },
              optional: true,
            },
            maxParallelism: { fieldType: { type: "number" }, optional: true },
          },
        },
        stagedDocumentType: null,
      },
    ],
    schemaValidation: true,
  },
  m02f5czs7a0jgvf5jx9thy07gn8g5r6r: {
    tables: [
      {
        tableName: "pendingStart",
        indexes: [
          { indexDescriptor: "segment", fields: ["segment", "_creationTime"] },
          { indexDescriptor: "workId", fields: ["workId", "_creationTime"] },
        ],
        stagedDbIndexes: [],
        searchIndexes: [],
        stagedSearchIndexes: [],
        vectorIndexes: [],
        stagedVectorIndexes: [],
        documentType: {
          type: "object",
          value: {
            segment: { fieldType: { type: "bigint" }, optional: false },
            workId: { fieldType: { type: "id", tableName: "work" }, optional: false },
          },
        },
        stagedDocumentType: null,
      },
    ],
    schemaValidation: true,
  },
};
