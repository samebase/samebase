// Captured with read-only `gh api` calls from samebase/tmp-alchemy-v2 on 2026-10-07, after the
// template's `alchemy` workflow published its first setup output (run 37545425944, rerun once).

/** The repository's GitHub id and default branch at the time of the capture. */
export const observedSetupOutputRepository = {
  githubRepositoryDatabaseId: "1407894795",
  defaultBranch: "main",
};

// GET /repos/samebase/tmp-alchemy-v2/actions/workflows/alchemy.yml/runs?branch=main, the fields of
// each run that the reader reads plus its name and numbers. Run 37545425944 is attempt 2 of a rerun.
export const observedSetupWorkflowRunPage = {
  total_count: 3,
  workflow_runs: [
    {
      id: 37545425944,
      name: "alchemy",
      path: ".github/workflows/alchemy.yml",
      event: "push",
      head_branch: "main",
      head_sha: "cf87dc6b81f2a3fc1525346dd587ec4e7b14760c",
      status: "completed",
      conclusion: "success",
      run_attempt: 2,
      run_number: 3,
      created_at: "2026-10-06T23:14:17Z",
      updated_at: "2026-10-06T23:17:19Z",
      run_started_at: "2026-10-06T23:15:54Z",
      html_url: "https://github.com/samebase/tmp-alchemy-v2/actions/runs/37545425944",
      repository: { id: 1407894795 },
      head_repository: { id: 1407894795 },
    },
    {
      id: 37531835607,
      name: "alchemy",
      path: ".github/workflows/alchemy.yml",
      event: "push",
      head_branch: "main",
      head_sha: "bb10cba31f3f50cf8dff89cf962f8ee78e8af4b2",
      status: "completed",
      conclusion: "success",
      run_attempt: 1,
      run_number: 2,
      created_at: "2026-10-06T21:09:27Z",
      updated_at: "2026-10-06T21:10:52Z",
      run_started_at: "2026-10-06T21:09:27Z",
      html_url: "https://github.com/samebase/tmp-alchemy-v2/actions/runs/37531835607",
      repository: { id: 1407894795 },
      head_repository: { id: 1407894795 },
    },
    {
      id: 37528068073,
      name: "alchemy",
      path: ".github/workflows/alchemy.yml",
      event: "push",
      head_branch: "main",
      head_sha: "91cca7a9c980a607c7064096fd97bd3a20eccdef",
      status: "completed",
      conclusion: "success",
      run_attempt: 1,
      run_number: 1,
      created_at: "2026-10-06T20:39:10Z",
      updated_at: "2026-10-06T20:40:33Z",
      run_started_at: "2026-10-06T20:39:10Z",
      html_url: "https://github.com/samebase/tmp-alchemy-v2/actions/runs/37528068073",
      repository: { id: 1407894795 },
      head_repository: { id: 1407894795 },
    },
  ],
};

// GET /repos/samebase/tmp-alchemy-v2/actions/artifacts?name=samebase-setup-output, complete. The
// rerun replaced the artifact of attempt 1 (overwrite: true) with this one, under a new id.
export const observedSetupOutputArtifactPage = {
  total_count: 1,
  artifacts: [
    {
      id: 11450791196,
      node_id: "MDg6QXJ0aWZhY3QxMTQ1MDc5MTE5Ng==",
      name: "samebase-setup-output",
      size_in_bytes: 414,
      url: "https://api.github.com/repos/samebase/tmp-alchemy-v2/actions/artifacts/11450791196",
      archive_download_url:
        "https://api.github.com/repos/samebase/tmp-alchemy-v2/actions/artifacts/11450791196/zip",
      expired: false,
      digest: "sha256:53186b9b4d66b6a9f930187edcb51f10d73f494d1bb990c4a927246ff0611607",
      created_at: "2026-10-06T23:17:16Z",
      updated_at: "2026-10-06T23:17:16Z",
      expires_at: "2027-01-04T23:15:56Z",
      workflow_run: {
        id: 37545425944,
        repository_id: 1407894795,
        head_repository_id: 1407894795,
        head_branch: "main",
        head_sha: "cf87dc6b81f2a3fc1525346dd587ec4e7b14760c",
      },
    },
  ],
};

/** GET /repos/samebase/tmp-alchemy-v2/actions/artifacts/11450791196/zip, base64. */
export const observedSetupOutputArchiveBase64 =
  "UEsDBBQACAAIACe6Rl0AAAAAAAAAAAAAAAAaAAAAc2FtZWJhc2Utc2V0dXAtb3V0cHV0Lmpzb251T7tygzAQ7PmKG9VxIvEQmDZp0qXPpDikk40NEiNkEsbjf88gyMRFUt3c7t7e7jUBYBP5sXWW1SAeln0MGIjVwDQNnZtJswirzl206dAv3DUBAGColLvY8KoXuaGi1FzoEptcGMk15w0KRE0ppybLog0A+3T+TH5kNbxHADa3SAY8LF5VlTZpkylN2T43ha6kFLwsqBSS0BTV5hVPLPYxbuiHHXbqSP28m9J7hXcuvLSeVHB+XqRPbCNvcX4kALe1pLMTff0WDIT92i6rCiF/KgzenUiFfzps7HYnpMjz/X2c9cmzs6Y9vGE4LrIVezyNzv6RLbkl31BLBwj0NBSt+AAAAKsBAABQSwECLQMUAAgACAAnukZd9DQUrfgAAACrAQAAGgAAAAAAAAAAACAApIEAAAAAc2FtZWJhc2Utc2V0dXAtb3V0cHV0Lmpzb25QSwUGAAAAAAEAAQBIAAAAQAEAAAAA";

/** The JSON file in that archive, parsed. */
export const observedSetupOutput = {
  version: 1,
  state: "deployed",
  cloudflare: {
    accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
    workers: [
      { tag: "882b2b3cde394f5d8661075e716eaf58", name: "tmp-alchemy-v2", rootDirectory: "/" },
    ],
  },
  convex: {
    teamId: "38516",
    projects: [{ projectId: "3161449", convexConfigPath: "convex.json" }],
  },
};

// The artifact `alchemy-output` of the spike in run 37531835607, from
// GET /repos/samebase/tmp-alchemy-v2/actions/runs/37531835607/artifacts, and its zip, base64. Its
// file holds the CLI's log lines before the JSON, which no version accepts.
export const observedSpikeArtifact = {
  id: 11443958659,
  node_id: "MDg6QXJ0aWZhY3QxMTQ0Mzk1ODY1OQ==",
  name: "alchemy-output",
  size_in_bytes: 403,
  url: "https://api.github.com/repos/samebase/tmp-alchemy-v2/actions/artifacts/11443958659",
  archive_download_url:
    "https://api.github.com/repos/samebase/tmp-alchemy-v2/actions/artifacts/11443958659/zip",
  expired: false,
  digest: "sha256:1a753525cd0f9b71def3dd63b3d9cc8ef46e524617abc06408132cedb2a9469c",
  created_at: "2026-10-06T21:10:47Z",
  updated_at: "2026-10-06T21:10:47Z",
  expires_at: "2027-01-04T21:09:28Z",
  workflow_run: {
    id: 37531835607,
    repository_id: 1407894795,
    head_repository_id: 1407894795,
    head_branch: "main",
    head_sha: "bb10cba31f3f50cf8dff89cf962f8ee78e8af4b2",
  },
};
export const observedSpikeArchiveBase64 =
  "UEsDBBQACAAIAFepRl0AAAAAAAAAAAAAAAATAAAAYWxjaGVteS1vdXRwdXQuanNvbpWOwUrDQBRF9/mKR9y00ExNjF1kV9IWgqWR2qxEwjh5MYOTmfBmEhUR/Ae3rvy0fomELhR3bu7icg/n3kZhEp4n8QWLF9EdZLtNDpOzcJpAqkxf1YoTJtBbqR8A9SDJ6Ba1g4GT5PcKLUzSbV6sNtvlfl0u0zQvdocyW83gd32dlYf8ar2bgtTWIa/A1OAahI5MLRUy7/j+BXusCW0zqn7kcOO4G9MQgiCsUDvJlfWOnx//JF49AP/J0CNSQcpPwG+c62wyn7u2C7gSDbYvwRCxru7YaWdZhYM/G0Fh9IDPf0DBCeteBdRIbQSSsUF8uWCnLRPjJ997874BUEsHCN7h2pD7AAAAZgEAAFBLAQItAxQACAAIAFepRl3e4dqQ+wAAAGYBAAATAAAAAAAAAAAAIACkgQAAAABhbGNoZW15LW91dHB1dC5qc29uUEsFBgAAAAABAAEAQQAAADwBAAAAAA==";

// Captured with read-only `gh api` calls from samebase/tmp-alchemy-06 on 2026-10-07, after the
// confirmed destroy of the app in run 37612780148. The template ran that destroy as a job of its
// `alchemy` workflow; it now runs it in the `Destroy app` workflow. So the destroy run below has
// that workflow's `name` and `path`, and the alchemy run list leaves it out. Every other field is
// as recorded.

/** The repository's GitHub id and default branch at the time of the capture. */
export const observedDestroyRepository = {
  githubRepositoryDatabaseId: "1408601277",
  defaultBranch: "main",
};

// GET /repos/samebase/tmp-alchemy-06/actions/workflows/alchemy.yml/runs?branch=main, the fields of
// each run that the reader reads plus its name and numbers, without the destroy run (total_count 2
// as recorded). Run 37606095039 is attempt 2 of a rerun, the deploy before the destroy.
export const observedDestroyAlchemyRunPage = {
  total_count: 1,
  workflow_runs: [
    {
      id: 37606095039,
      name: "alchemy",
      path: ".github/workflows/alchemy.yml",
      event: "push",
      head_branch: "main",
      head_sha: "0ca4d3e7df275a56b1b03da0882cc19ffe14e70e",
      status: "completed",
      conclusion: "success",
      run_attempt: 2,
      run_number: 1,
      created_at: "2026-10-07T10:14:39Z",
      updated_at: "2026-10-07T11:07:27Z",
      run_started_at: "2026-10-07T11:05:58Z",
      html_url: "https://github.com/samebase/tmp-alchemy-06/actions/runs/37606095039",
      repository: { id: 1408601277 },
      head_repository: { id: 1408601277 },
    },
  ],
};

// GET /repos/samebase/tmp-alchemy-06/actions/runs/37612780148, the same fields, with the Destroy app
// workflow's name and path.
export const observedDestroyRun = {
  id: 37612780148,
  name: "Destroy app",
  path: ".github/workflows/destroy.yml",
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: "0ca4d3e7df275a56b1b03da0882cc19ffe14e70e",
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  run_number: 2,
  created_at: "2026-10-07T11:14:49Z",
  updated_at: "2026-10-07T11:16:45Z",
  run_started_at: "2026-10-07T11:14:49Z",
  html_url: "https://github.com/samebase/tmp-alchemy-06/actions/runs/37612780148",
  repository: { id: 1408601277 },
  head_repository: { id: 1408601277 },
};

// GET /repos/samebase/tmp-alchemy-06/actions/artifacts?name=samebase-setup-output, complete: the
// destroy receipt of run 37612780148 and the setup output of the deploy before it.
export const observedDestroyArtifactPage = {
  total_count: 2,
  artifacts: [
    {
      id: 11479280115,
      node_id: "MDg6QXJ0aWZhY3QxMTQ3OTI4MDExNQ==",
      name: "samebase-setup-output",
      size_in_bytes: 208,
      url: "https://api.github.com/repos/samebase/tmp-alchemy-06/actions/artifacts/11479280115",
      archive_download_url:
        "https://api.github.com/repos/samebase/tmp-alchemy-06/actions/artifacts/11479280115/zip",
      expired: false,
      digest: "sha256:db0659211f15edabab24d09caefcdddc2b04feb09eea2207f40bc25b20b5b54f",
      created_at: "2026-10-07T11:16:41Z",
      updated_at: "2026-10-07T11:16:41Z",
      expires_at: "2027-01-05T11:14:51Z",
      workflow_run: {
        id: 37612780148,
        repository_id: 1408601277,
        head_repository_id: 1408601277,
        head_branch: "main",
        head_sha: "0ca4d3e7df275a56b1b03da0882cc19ffe14e70e",
      },
    },
    {
      id: 11477119111,
      node_id: "MDg6QXJ0aWZhY3QxMTQ3NzExOTExMQ==",
      name: "samebase-setup-output",
      size_in_bytes: 413,
      url: "https://api.github.com/repos/samebase/tmp-alchemy-06/actions/artifacts/11477119111",
      archive_download_url:
        "https://api.github.com/repos/samebase/tmp-alchemy-06/actions/artifacts/11477119111/zip",
      expired: false,
      digest: "sha256:0548ecf108ca7b77e55f4a477ba422f909a9d3d82ad678108699bf577be46951",
      created_at: "2026-10-07T11:07:23Z",
      updated_at: "2026-10-07T11:07:23Z",
      expires_at: "2027-01-05T11:06:00Z",
      workflow_run: {
        id: 37606095039,
        repository_id: 1408601277,
        head_repository_id: 1408601277,
        head_branch: "main",
        head_sha: "0ca4d3e7df275a56b1b03da0882cc19ffe14e70e",
      },
    },
  ],
};

/** GET /repos/samebase/tmp-alchemy-06/actions/artifacts/11479280115/zip, base64. */
export const observedDestroyReceiptArchiveBase64 =
  "UEsDBBQACAAIAAxaR10AAAAAAAAAAAAAAAAaAAAAc2FtZWJhc2Utc2V0dXAtb3V0cHV0Lmpzb26r5lJQUCpLLSrOzM9TslIw1AHxi0sSS1KVrBSUUlKLS4ryK1NTlLhquQBQSwcII8GdoyoAAAArAAAAUEsBAi0DFAAIAAgADFpHXSPBnaMqAAAAKwAAABoAAAAAAAAAAAAgAKSBAAAAAHNhbWViYXNlLXNldHVwLW91dHB1dC5qc29uUEsFBgAAAAABAAEASAAAAHIAAAAAAA==";
