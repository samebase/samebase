// The replies of the @samebase/alchemy-convex 0.35.0 store (store version 7, `state:version`
// answered 7), the directory packages/alchemy-convex/src/store of samebase/samebase at commit
// 5af4b4845f4f2ef196984bfce71a57686bd3614f (at beb3643aa9c9ef4a213020de54cad7f15a396359 only a
// comment of version.ts differs), on a local Convex backend
// (precompiled-2026-10-22-1447815, Convex CLI 1.48.0), captured on 2026-11-08T13:08:01.373Z.
// The rows are the ones captured on 2026-10-22T09:38:17.872Z from the Alchemy state store of team
// `nicu` for the stack `samebase/samebase`. Each resource value went through `state:set` and each
// output through `state:setOutput` unchanged, as a 0.35.0 run writes them. No row holds a secret.
// - `prod`: the push to main that merged https://github.com/samebase/samebase/pull/1766, from
//   apps/samebase/alchemy.run.ts with samebase/alchemy-convex 0.7.0, so the Site row has no rootDir.
//   Its output holds the run record of that deploy under `samebase.run`.
// - `pr-1768`: the preview of https://github.com/samebase/samebase/pull/1768, from the root
//   alchemy.run.ts with 0.8.0, so the Site row has rootDir apps/samebase. Its output holds the run
//   record of that deploy.
// - `pr-1756`: the rows of an interrupted preview deploy, with no `attr` on the Site row and no
//   output, so no run record.
// `state:stacks` and `state:readStack` were read through `POST /api/function` with the admin key of
// the local backend; the store also held `samebase/base-alchemy` (observedAlchemyState.ts). Each
// reply is complete and unedited.
// https://github.com/samebase/samebase/blob/beb3643aa9c9ef4a213020de54cad7f15a396359/packages/alchemy-convex/src/store/component/state.ts#L53-L78
// https://github.com/samebase/samebase/blob/beb3643aa9c9ef4a213020de54cad7f15a396359/packages/alchemy-convex/src/store/component/state.ts#L292-L345
export const observedSamebaseStacksReply = {
  status: "success",
  value: ["samebase/base-alchemy", "samebase/samebase"],
};

export const observedSamebaseStackReply = {
  status: "success",
  value: {
    stages: [
      {
        name: "pr-1756",
        output: null,
        resources: [
          {
            fqn: "PreviewComment",
            value:
              '{"status":"creating","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"de8238405c897c4da29bb0991c182b08","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"samebase","issueNumber":1756},"providerVersion":0,"bindings":[],"downstream":[],"removalPolicy":"retain"}',
          },
          {
            fqn: "Project",
            value:
              '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"4d896ee37d8592fdf8069ed54793ce3f","resourceType":"Convex.Project","props":{"team":"nicu","slug":"samebase"},"attr":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Site"],"removalPolicy":"retain"}',
          },
          {
            fqn: "Site",
            value:
              '{"status":"creating","fqn":"Site","logicalId":"Site","instanceId":"ef710abff4909b6dcd5616c124673f60","resourceType":"Convex.Deployment","props":{"project":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"type":"preview","name":"pr-1756","env":{"SAMEBASE_COMMIT":"6838f0fb7985651aea04870435f56acf5e10dc58"},"source":{"path":"./convex","command":["node","./scripts/deploy-preview.ts"]}},"providerVersion":0,"bindings":[],"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
          },
        ],
      },
      {
        name: "pr-1768",
        output:
          '{"url":"https://aware-bobcat-542.convex.site","samebase.run":{"version":1,"repository":"samebase/samebase","stackFile":"alchemy.run.ts","branch":"alchemy-root-stack","pullRequest":1768,"headCommit":"429c1218a16d2ee74b9da68d684dc460a0a67ce8","runUrl":"https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1","source":"github-actions","recordedAt":"2026-10-22T09:34:35.577Z"}}',
        resources: [
          {
            fqn: "PreviewComment",
            value:
              '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"ffefddd78175dd5652b32a795011bcb1","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"samebase","issueNumber":1768,"body":"Preview `pr-1768`: https://aware-bobcat-542.convex.site\\nDeployment: https://aware-bobcat-542.convex.cloud\\nDashboard: https://dashboard.convex.dev/d/aware-bobcat-542"},"attr":{"commentId":6337556626,"htmlUrl":"https://github.com/samebase/samebase/pull/1768#issuecomment-6337556626","updatedAt":"2026-10-22T09:34:35Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
          },
          {
            fqn: "Project",
            value:
              '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"bd31262bb4f76d3fd1911fc140f4ecf4","resourceType":"Convex.Project","props":{"team":"nicu","slug":"samebase"},"attr":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Site"],"removalPolicy":"retain"}',
          },
          {
            fqn: "Site",
            value:
              '{"status":"created","fqn":"Site","logicalId":"Site","instanceId":"ee443eab47508202e722a01f84c1ceed","resourceType":"Convex.Deployment","props":{"project":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"type":"preview","name":"pr-1768","rootDir":"apps/samebase","env":{"SAMEBASE_COMMIT":"429c1218a16d2ee74b9da68d684dc460a0a67ce8"},"source":{"path":"./convex","command":["node","./scripts/deploy-preview.ts"]}},"attr":{"projectId":839311,"type":"preview","name":"aware-bobcat-542","reference":"preview/pr-1768","previewName":"pr-1768","url":"https://aware-bobcat-542.convex.cloud","siteUrl":"https://aware-bobcat-542.convex.site","hash":"a7d29e71315a5aecc328d9aaae85d72f5e036f73f2aa1194026f1194ac1ea6c6","envNames":["SAMEBASE_COMMIT"]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
          },
        ],
      },
      {
        name: "prod",
        output:
          '{"url":"https://clear-butterfly-858.convex.site","samebase.run":{"version":1,"repository":"samebase/samebase","stackFile":"apps/samebase/alchemy.run.ts","branch":"main","pullRequest":null,"headCommit":"1592243a49970f5c5142009b7ca7b2d71d31f104","runUrl":"https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1","source":"github-actions","recordedAt":"2026-10-22T08:22:58.152Z"}}',
        resources: [
          {
            fqn: "Domains",
            value:
              '{"status":"updated","fqn":"Domains","logicalId":"Domains","instanceId":"90e90f44befcc4d00078c7dd7029a81f","resourceType":"Cloudflare.Worker","props":{"name":"samebase-domains","main":"../domain-router/src/index.ts","workersDev":false,"routes":[{"pattern":"*.json.md/*","zoneName":"json.md"},{"pattern":"*.xml.md/*","zoneName":"xml.md"}],"isExternal":true},"attr":{"workerId":"e93839556aed43a7a92551c3ae87b902","workerName":"samebase-domains","logpush":false,"urls":[],"tags":["alchemy:stack:samebase/samebase","alchemy:stage:prod","alchemy:id:Domains"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[{"id":"c9c74a58ea1a4fbbb4174503a6de8183","pattern":"*.json.md/*","zoneId":"ac816f257bd126fb7628aaa77e92cff9"},{"id":"441b9903047f4105a9e1a9dff470af70","pattern":"*.xml.md/*","zoneId":"59e83b745d8cc54962272ae2f14789cc"}],"crons":[],"tailConsumers":[],"hash":{"bundle":"6e17df0fa083546e6940e0d0eee4040b54df2081baeb3f1715a710a67537ee0b","metadata":"eed4bfb6d194156a69d28a207b3a864faafa55a17a2857e7ca14cf51b1b14a9b"}},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"destroy","providerMode":"live"}',
          },
          {
            fqn: "PosthogProxy",
            value:
              '{"status":"updated","fqn":"PosthogProxy","logicalId":"PosthogProxy","instanceId":"cf23884e6ac645ccf9323758b4399d29","resourceType":"Cloudflare.Worker","props":{"name":"samebase-posthog-proxy","main":"../posthog-proxy/src/index.ts","workersDev":false,"routes":[{"pattern":"e.samebase.com/*","zoneName":"samebase.com"}],"isExternal":true},"attr":{"workerId":"3bf04e17d2ae47cc9feb77066c90823b","workerName":"samebase-posthog-proxy","logpush":false,"urls":[],"tags":["alchemy:stack:samebase/samebase","alchemy:stage:prod","alchemy:id:PosthogProxy"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[{"id":"d14bb32e6c4c47c4ac337e380c7180a7","pattern":"e.samebase.com/*","zoneId":"2f2e7713e926a7282b25796b02826f02","url":"https://e.samebase.com"}],"crons":[],"tailConsumers":[],"hash":{"bundle":"83ba0db8e87b6cace413d38cd95b20017843c9d78bab2818796fbba1ef387426","metadata":"eed4bfb6d194156a69d28a207b3a864faafa55a17a2857e7ca14cf51b1b14a9b"}},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain","providerMode":"live"}',
          },
          {
            fqn: "Project",
            value:
              '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"01d66d180c34033ea79f723f5ea33018","resourceType":"Convex.Project","props":{"team":"nicu","name":"samebase"},"attr":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Site"],"removalPolicy":"retain"}',
          },
          {
            fqn: "Site",
            value:
              '{"status":"updated","fqn":"Site","logicalId":"Site","instanceId":"65e3ea28eb33d420f12869b9fdac03e0","resourceType":"Convex.Deployment","props":{"project":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"type":"prod","env":{"SAMEBASE_COMMIT":"1592243a49970f5c5142009b7ca7b2d71d31f104"},"source":{"path":"./convex","command":["node","--run","deploy"]}},"attr":{"projectId":839311,"type":"prod","name":"clear-butterfly-858","reference":"production","url":"https://clear-butterfly-858.convex.cloud","siteUrl":"https://clear-butterfly-858.convex.site","hash":"0d3c0ada6410d7b7081c8a54cc72e821a8c0620b7e1e4763063e88268d23fae4","envNames":["SAMEBASE_COMMIT"]},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
          },
        ],
      },
    ],
  },
};

// The reply of `reader:repository` from the same store, read through `POST /api/query` with the
// token that `reader:authorize` issued for `samebase/samebase`: the `value` that a subscription of
// the browser receives. It holds every stage of the stack, with the outputs as written. `pr-1756`
// has no output, so it has no run record.
// https://github.com/samebase/samebase/blob/beb3643aa9c9ef4a213020de54cad7f15a396359/packages/alchemy-convex/src/store/component/reader.ts#L11-L96
export const observedSamebaseRepositoryReply = {
  stacks: [
    {
      name: "samebase/samebase",
      stages: [
        {
          name: "pr-1756",
          output: null,
          resources: [
            {
              fqn: "PreviewComment",
              value:
                '{"status":"creating","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"de8238405c897c4da29bb0991c182b08","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"samebase","issueNumber":1756},"providerVersion":0,"bindings":[],"downstream":[],"removalPolicy":"retain"}',
            },
            {
              fqn: "Project",
              value:
                '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"4d896ee37d8592fdf8069ed54793ce3f","resourceType":"Convex.Project","props":{"team":"nicu","slug":"samebase"},"attr":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Site"],"removalPolicy":"retain"}',
            },
            {
              fqn: "Site",
              value:
                '{"status":"creating","fqn":"Site","logicalId":"Site","instanceId":"ef710abff4909b6dcd5616c124673f60","resourceType":"Convex.Deployment","props":{"project":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"type":"preview","name":"pr-1756","env":{"SAMEBASE_COMMIT":"6838f0fb7985651aea04870435f56acf5e10dc58"},"source":{"path":"./convex","command":["node","./scripts/deploy-preview.ts"]}},"providerVersion":0,"bindings":[],"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
            },
          ],
        },
        {
          name: "pr-1768",
          output:
            '{"url":"https://aware-bobcat-542.convex.site","samebase.run":{"version":1,"repository":"samebase/samebase","stackFile":"alchemy.run.ts","branch":"alchemy-root-stack","pullRequest":1768,"headCommit":"429c1218a16d2ee74b9da68d684dc460a0a67ce8","runUrl":"https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1","source":"github-actions","recordedAt":"2026-10-22T09:34:35.577Z"}}',
          resources: [
            {
              fqn: "PreviewComment",
              value:
                '{"status":"created","fqn":"PreviewComment","logicalId":"PreviewComment","instanceId":"ffefddd78175dd5652b32a795011bcb1","resourceType":"GitHub.Comment","props":{"owner":"samebase","repository":"samebase","issueNumber":1768,"body":"Preview `pr-1768`: https://aware-bobcat-542.convex.site\\nDeployment: https://aware-bobcat-542.convex.cloud\\nDashboard: https://dashboard.convex.dev/d/aware-bobcat-542"},"attr":{"commentId":6337556626,"htmlUrl":"https://github.com/samebase/samebase/pull/1768#issuecomment-6337556626","updatedAt":"2026-10-22T09:34:35Z"},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
            },
            {
              fqn: "Project",
              value:
                '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"bd31262bb4f76d3fd1911fc140f4ecf4","resourceType":"Convex.Project","props":{"team":"nicu","slug":"samebase"},"attr":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Site"],"removalPolicy":"retain"}',
            },
            {
              fqn: "Site",
              value:
                '{"status":"created","fqn":"Site","logicalId":"Site","instanceId":"ee443eab47508202e722a01f84c1ceed","resourceType":"Convex.Deployment","props":{"project":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"type":"preview","name":"pr-1768","rootDir":"apps/samebase","env":{"SAMEBASE_COMMIT":"429c1218a16d2ee74b9da68d684dc460a0a67ce8"},"source":{"path":"./convex","command":["node","./scripts/deploy-preview.ts"]}},"attr":{"projectId":839311,"type":"preview","name":"aware-bobcat-542","reference":"preview/pr-1768","previewName":"pr-1768","url":"https://aware-bobcat-542.convex.cloud","siteUrl":"https://aware-bobcat-542.convex.site","hash":"a7d29e71315a5aecc328d9aaae85d72f5e036f73f2aa1194026f1194ac1ea6c6","envNames":["SAMEBASE_COMMIT"]},"bindings":[],"providerVersion":0,"downstream":["PreviewComment"],"removalPolicy":"destroy"}',
            },
          ],
        },
        {
          name: "prod",
          output:
            '{"url":"https://clear-butterfly-858.convex.site","samebase.run":{"version":1,"repository":"samebase/samebase","stackFile":"apps/samebase/alchemy.run.ts","branch":"main","pullRequest":null,"headCommit":"1592243a49970f5c5142009b7ca7b2d71d31f104","runUrl":"https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1","source":"github-actions","recordedAt":"2026-10-22T08:22:58.152Z"}}',
          resources: [
            {
              fqn: "Domains",
              value:
                '{"status":"updated","fqn":"Domains","logicalId":"Domains","instanceId":"90e90f44befcc4d00078c7dd7029a81f","resourceType":"Cloudflare.Worker","props":{"name":"samebase-domains","main":"../domain-router/src/index.ts","workersDev":false,"routes":[{"pattern":"*.json.md/*","zoneName":"json.md"},{"pattern":"*.xml.md/*","zoneName":"xml.md"}],"isExternal":true},"attr":{"workerId":"e93839556aed43a7a92551c3ae87b902","workerName":"samebase-domains","logpush":false,"urls":[],"tags":["alchemy:stack:samebase/samebase","alchemy:stage:prod","alchemy:id:Domains"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[{"id":"c9c74a58ea1a4fbbb4174503a6de8183","pattern":"*.json.md/*","zoneId":"ac816f257bd126fb7628aaa77e92cff9"},{"id":"441b9903047f4105a9e1a9dff470af70","pattern":"*.xml.md/*","zoneId":"59e83b745d8cc54962272ae2f14789cc"}],"crons":[],"tailConsumers":[],"hash":{"bundle":"6e17df0fa083546e6940e0d0eee4040b54df2081baeb3f1715a710a67537ee0b","metadata":"eed4bfb6d194156a69d28a207b3a864faafa55a17a2857e7ca14cf51b1b14a9b"}},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"destroy","providerMode":"live"}',
            },
            {
              fqn: "PosthogProxy",
              value:
                '{"status":"updated","fqn":"PosthogProxy","logicalId":"PosthogProxy","instanceId":"cf23884e6ac645ccf9323758b4399d29","resourceType":"Cloudflare.Worker","props":{"name":"samebase-posthog-proxy","main":"../posthog-proxy/src/index.ts","workersDev":false,"routes":[{"pattern":"e.samebase.com/*","zoneName":"samebase.com"}],"isExternal":true},"attr":{"workerId":"3bf04e17d2ae47cc9feb77066c90823b","workerName":"samebase-posthog-proxy","logpush":false,"urls":[],"tags":["alchemy:stack:samebase/samebase","alchemy:stage:prod","alchemy:id:PosthogProxy"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[{"id":"d14bb32e6c4c47c4ac337e380c7180a7","pattern":"e.samebase.com/*","zoneId":"2f2e7713e926a7282b25796b02826f02","url":"https://e.samebase.com"}],"crons":[],"tailConsumers":[],"hash":{"bundle":"83ba0db8e87b6cace413d38cd95b20017843c9d78bab2818796fbba1ef387426","metadata":"eed4bfb6d194156a69d28a207b3a864faafa55a17a2857e7ca14cf51b1b14a9b"}},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain","providerMode":"live"}',
            },
            {
              fqn: "Project",
              value:
                '{"status":"updated","fqn":"Project","logicalId":"Project","instanceId":"01d66d180c34033ea79f723f5ea33018","resourceType":"Convex.Project","props":{"team":"nicu","name":"samebase"},"attr":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"bindings":[],"providerVersion":0,"downstream":["Site"],"removalPolicy":"retain"}',
            },
            {
              fqn: "Site",
              value:
                '{"status":"updated","fqn":"Site","logicalId":"Site","instanceId":"65e3ea28eb33d420f12869b9fdac03e0","resourceType":"Convex.Deployment","props":{"project":{"projectId":839311,"slug":"samebase","name":"samebase","teamId":38516,"prodDeploymentName":"clear-butterfly-858","prodDeploymentUrl":"https://clear-butterfly-858.convex.cloud"},"type":"prod","env":{"SAMEBASE_COMMIT":"1592243a49970f5c5142009b7ca7b2d71d31f104"},"source":{"path":"./convex","command":["node","--run","deploy"]}},"attr":{"projectId":839311,"type":"prod","name":"clear-butterfly-858","reference":"production","url":"https://clear-butterfly-858.convex.cloud","siteUrl":"https://clear-butterfly-858.convex.site","hash":"0d3c0ada6410d7b7081c8a54cc72e821a8c0620b7e1e4763063e88268d23fae4","envNames":["SAMEBASE_COMMIT"]},"bindings":[],"providerVersion":0,"downstream":[],"removalPolicy":"retain"}',
            },
          ],
        },
      ],
    },
  ],
  store: "found",
};
