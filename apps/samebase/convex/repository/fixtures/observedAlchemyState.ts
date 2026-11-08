// The replies of the @samebase/alchemy-convex 0.34.0 store (store version 7, `state:version`
// answered 7), the directory packages/alchemy-convex/src/store of samebase/samebase at commit
// 5af4b4845f4f2ef196984bfce71a57686bd3614f, on a local Convex backend
// (precompiled-2026-10-22-1447815, Convex CLI 1.48.0), captured on 2026-11-08T13:08:01.373Z.
// The rows are the ones captured on 2026-10-21T20:10:08.576Z from the Alchemy state store of team
// `nicu` (deployment artful-alligator-66, samebase/alchemy-convex 0.7.0) for the stack
// `samebase/base-alchemy`. Each resource value went through `state:set` and each output through
// `state:setOutput` unchanged, as a 0.34.0 run writes them. `prod` was written by the push to main
// that merged samebase/base-alchemy#23, and its output holds the run record of that deploy under
// `samebase.run`. `pr-24` and `pr-25` were deployed from branches that predate 0.7.0, so their
// outputs hold no run record.
// `state:readStack` was read through `POST /api/function` with the admin key of the local backend.
// The reply is complete and unedited.
// https://github.com/samebase/samebase/blob/5af4b4845f4f2ef196984bfce71a57686bd3614f/packages/alchemy-convex/src/store/component/state.ts#L292-L345
export const observedAlchemyStackReply = {
  status: "success",
  value: {
    stages: [
      {
        name: "pr-24",
        output: '{"url":"https://nautical-eagle-647.convex.site"}',
        resources: [
          {
            fqn: "Deployment",
            value:
              '{"status":"created","fqn":"Deployment","logicalId":"Deployment","instanceId":"acc35e31035cec5e2c7429739f5819a8","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"type":"preview","name":"pr-24","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"preview","name":"nautical-eagle-647","reference":"preview/pr-24","previewName":"pr-24","url":"https://nautical-eagle-647.convex.cloud","siteUrl":"https://nautical-eagle-647.convex.site","hash":"d72f3609d31dc6598413d023186ba5e3acd22a032056d0a93a814807cf94857b","envNames":[]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
          },
          {
            fqn: "PreviewComment",
            value:
              '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"67dad8d9327c3532f8bb134e4d63e005","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"base-alchemy","issueNumber":24,"body":"Preview `pr-24`: https://nautical-eagle-647.convex.site"},"attr":{"commentId":6325221197,"htmlUrl":"https://github.com/samebase/base-alchemy/pull/24#issuecomment-6325221197","updatedAt":"2026-10-21T19:56:46Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
          },
        ],
      },
      {
        name: "pr-25",
        output: '{"url":"https://fastidious-squid-196.convex.site"}',
        resources: [
          {
            fqn: "Deployment",
            value:
              '{"status":"created","fqn":"Deployment","logicalId":"Deployment","instanceId":"e211354c8358b63d49f1f02c50b6c7d4","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"type":"preview","name":"pr-25","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"preview","name":"fastidious-squid-196","reference":"preview/pr-25","previewName":"pr-25","url":"https://fastidious-squid-196.convex.cloud","siteUrl":"https://fastidious-squid-196.convex.site","hash":"29621293225ebab2abf2ed56346104da76ca7aee114bb61d5f3ff3edc8d6efdc","envNames":[]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
          },
          {
            fqn: "PreviewComment",
            value:
              '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"9ac624e4a6b192b69bb88f0726d779a6","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"base-alchemy","issueNumber":25,"body":"Preview `pr-25`: https://fastidious-squid-196.convex.site"},"attr":{"commentId":6325229031,"htmlUrl":"https://github.com/samebase/base-alchemy/pull/25#issuecomment-6325229031","updatedAt":"2026-10-21T19:57:09Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
          },
        ],
      },
      {
        name: "prod",
        output:
          '{"url":"https://ideal-dolphin-15.convex.site","samebase.run":{"version":1,"repository":"samebase/base-alchemy","stackFile":"alchemy.run.ts","branch":"main","pullRequest":null,"headCommit":"a4d98f2ad150dee07e19fa9c348e70240aca1dac","runUrl":"https://github.com/samebase/base-alchemy/actions/runs/39666079880/attempts/1","source":"github-actions","recordedAt":"2026-10-21T19:58:06.882Z"}}',
        resources: [
          {
            fqn: "Deployment",
            value:
              '{"status":"updated","fqn":"Deployment","logicalId":"Deployment","instanceId":"4d7ece351b21dbb5b0833760a438ea9a","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"type":"prod","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"prod","name":"ideal-dolphin-15","reference":"production","url":"https://ideal-dolphin-15.convex.cloud","siteUrl":"https://ideal-dolphin-15.convex.site","hash":"296fc2fcf62986dfc9712699f6784e3ad75d053c11e455709b5abf0aea4c5d2f","envNames":[]},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
          },
          {
            fqn: "Project",
            value:
              '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"11848c0297609207b73a6c4f1244439a","resourceType":"Convex.Project","props":{"team":"nicu","name":"base-alchemy"},"attr":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Deployment"],"removalPolicy":"destroy"}',
          },
        ],
      },
    ],
  },
};

// The reply of `reader:repository` from the same store, read through `POST /api/query` with the
// token that `reader:authorize` issued for `samebase/base-alchemy`: the `value` that a subscription
// of the browser receives. It holds every stage of the stack, with the outputs as written. Only the
// output of `prod` has a run record of the repository.
// https://github.com/samebase/samebase/blob/5af4b4845f4f2ef196984bfce71a57686bd3614f/packages/alchemy-convex/src/store/component/reader.ts#L11-L96
export const observedBaseAlchemyRepositoryReply = {
  stacks: [
    {
      name: "samebase/base-alchemy",
      stages: [
        {
          name: "pr-24",
          output: '{"url":"https://nautical-eagle-647.convex.site"}',
          resources: [
            {
              fqn: "Deployment",
              value:
                '{"status":"created","fqn":"Deployment","logicalId":"Deployment","instanceId":"acc35e31035cec5e2c7429739f5819a8","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"type":"preview","name":"pr-24","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"preview","name":"nautical-eagle-647","reference":"preview/pr-24","previewName":"pr-24","url":"https://nautical-eagle-647.convex.cloud","siteUrl":"https://nautical-eagle-647.convex.site","hash":"d72f3609d31dc6598413d023186ba5e3acd22a032056d0a93a814807cf94857b","envNames":[]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
            },
            {
              fqn: "PreviewComment",
              value:
                '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"67dad8d9327c3532f8bb134e4d63e005","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"base-alchemy","issueNumber":24,"body":"Preview `pr-24`: https://nautical-eagle-647.convex.site"},"attr":{"commentId":6325221197,"htmlUrl":"https://github.com/samebase/base-alchemy/pull/24#issuecomment-6325221197","updatedAt":"2026-10-21T19:56:46Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
            },
          ],
        },
        {
          name: "pr-25",
          output: '{"url":"https://fastidious-squid-196.convex.site"}',
          resources: [
            {
              fqn: "Deployment",
              value:
                '{"status":"created","fqn":"Deployment","logicalId":"Deployment","instanceId":"e211354c8358b63d49f1f02c50b6c7d4","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"type":"preview","name":"pr-25","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"preview","name":"fastidious-squid-196","reference":"preview/pr-25","previewName":"pr-25","url":"https://fastidious-squid-196.convex.cloud","siteUrl":"https://fastidious-squid-196.convex.site","hash":"29621293225ebab2abf2ed56346104da76ca7aee114bb61d5f3ff3edc8d6efdc","envNames":[]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
            },
            {
              fqn: "PreviewComment",
              value:
                '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"9ac624e4a6b192b69bb88f0726d779a6","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"base-alchemy","issueNumber":25,"body":"Preview `pr-25`: https://fastidious-squid-196.convex.site"},"attr":{"commentId":6325229031,"htmlUrl":"https://github.com/samebase/base-alchemy/pull/25#issuecomment-6325229031","updatedAt":"2026-10-21T19:57:09Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
            },
          ],
        },
        {
          name: "prod",
          output:
            '{"url":"https://ideal-dolphin-15.convex.site","samebase.run":{"version":1,"repository":"samebase/base-alchemy","stackFile":"alchemy.run.ts","branch":"main","pullRequest":null,"headCommit":"a4d98f2ad150dee07e19fa9c348e70240aca1dac","runUrl":"https://github.com/samebase/base-alchemy/actions/runs/39666079880/attempts/1","source":"github-actions","recordedAt":"2026-10-21T19:58:06.882Z"}}',
          resources: [
            {
              fqn: "Deployment",
              value:
                '{"status":"updated","fqn":"Deployment","logicalId":"Deployment","instanceId":"4d7ece351b21dbb5b0833760a438ea9a","resourceType":"Convex.Deployment","props":{"project":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"type":"prod","source":{"path":"./convex","command":["node","--run","deploy"],"include":["src/**","public/**","scripts/**","vite.config.ts","tsconfig*.json"]}},"attr":{"projectId":3245938,"type":"prod","name":"ideal-dolphin-15","reference":"production","url":"https://ideal-dolphin-15.convex.cloud","siteUrl":"https://ideal-dolphin-15.convex.site","hash":"296fc2fcf62986dfc9712699f6784e3ad75d053c11e455709b5abf0aea4c5d2f","envNames":[]},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
            },
            {
              fqn: "Project",
              value:
                '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"11848c0297609207b73a6c4f1244439a","resourceType":"Convex.Project","props":{"team":"nicu","name":"base-alchemy"},"attr":{"projectId":3245938,"slug":"base-alchemy","name":"base-alchemy","teamId":38516,"prodDeploymentName":"ideal-dolphin-15","prodDeploymentUrl":"https://ideal-dolphin-15.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Deployment"],"removalPolicy":"destroy"}',
            },
          ],
        },
      ],
    },
  ],
  store: "found",
};

// The reply of the Convex Management API `GET /projects/3245938` for the project that the stage
// `prod` above deploys, captured on 2026-10-22 with the Convex CLI login.
export const observedBaseAlchemyProject = {
  id: 3245938,
  name: "base-alchemy",
  slug: "base-alchemy",
  teamId: 38516,
  teamSlug: "nicu",
  createTime: 1792474666951,
  prodDeploymentName: "ideal-dolphin-15",
  devDeploymentName: "steady-gopher-786",
};

// The reply of the Convex Management API `GET /projects/3245938/deployment?defaultProd=true` for the
// project that the stage `prod` above deploys, captured on 2026-10-22 with the Convex CLI login.
export const observedBaseAlchemyProductionDeployment = {
  kind: "cloud",
  id: 6306909,
  name: "ideal-dolphin-15",
  createTime: 1792475812665,
  lastDeployTime: 1792612685570,
  deploymentType: "prod",
  projectId: 3245938,
  creator: 38842,
  previewIdentifier: null,
  region: "aws-us-east-1",
  isDefault: true,
  reference: "production",
  dashboardEditConfirmation: null,
  deploymentUrl: "https://ideal-dolphin-15.convex.cloud",
  class: "s256",
  sendLogsToClient: null,
};
