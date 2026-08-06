# Vault Folder Removal Rollout

This runbook removes the stored personal vault folder data after the product stops folder reads and
writes. It does not remove repository filesystem folders. This procedure has not been run. Run it
only as a separately approved operator change after this implementation is merged and deployed. Do
not run it from an implementation worktree.

## Safety conditions

Use the production target setup in [Convex Production Reads](./convex-production-reads.md). Run the
commands from the primary checkout `apps/samebase` directory. Clear `CONVEX_DEPLOY_KEY` and set the
resolved `CONVEX_DEPLOYMENT` for every Convex command. Never use `--push` during this procedure.

Stop if one of these conditions is true:

- The Dashboard URL does not match the approved team, project, and production deployment.
- The final main-branch production Cloudflare Workers Build does not identify the exact approved
  stopping-code commit SHA.
- The recorded Workers Build is not successful, its `convex deploy` build stage is not successful,
  or its `wrangler deploy` deploy stage is not successful.
- A later main-branch production Workers Build exists.
- The cleanup function is missing or the status is different from the expected phase.
- An assignment remains before folder cleanup or assignment-table deletion.
- A deleted table is still present in the table list.
- Any command or Dashboard action reports an error.

Do not deploy an older commit after a physical table is deleted. The old schema can recreate its
indexes. Move directly from table deletion to the narrow schema-removal deployment.

## Evidence record

Create one change record. Record only these items:

- approved production deployment name, team, and project
- one final main-branch production Cloudflare Workers Build identity, URL, exact stopping-code
  commit SHA, and completion time
- successful `convex deploy` build stage and successful `wrangler deploy` deploy stage from that
  recorded build
- secure backup reference and completion time
- initial table list, each status result, and each batch row count
- the zero-row proof for assignments and folders
- the table list after each physical table deletion
- the Convex Dashboard audit event for each table deletion
- schema-removal commit SHA and its deployment completion time

Do not copy table rows, access tokens, deploy keys, or provider credentials into the record.

## Procedure

1. Record the approved stopping-code commit SHA. Deploy that commit through the normal production
   flow from `main`. In the Cloudflare Dashboard, open the one final production Workers Build for
   that commit. Confirm all of these facts before cleanup:

   - The build branch is `main`.
   - The build identifies the exact approved stopping-code Git commit SHA.
   - The overall build completed successfully.
   - The build stage that runs `convex deploy` completed successfully.
   - The deploy stage that runs `wrangler deploy` completed successfully.
   - No later main-branch production Workers Build exists.

   Record that one build's identity, URL, exact Git commit SHA, and completion time. Also record the
   successful `convex deploy` and `wrangler deploy` stages from that build. Do not combine evidence
   from different builds. Confirm that the live commit contains all of these changes:

   - `getVaultFolderState` returns empty arrays.
   - Every old public folder mutation fails with `Vault folders are no longer available.`
   - Account deletion and vault deletion do not mutate either folder table.
   - `vault/folderCleanup:getRemovalStatus`, `deleteAssignmentBatch`, and `deleteFolderBatch` are
     deployed.

2. Resolve the target from the primary checkout as specified in
   [Convex Production Reads](./convex-production-reads.md). Store its comment-free value in the
   task-specific `target_convex_deployment` variable. Display the exact resolved deployment, print
   its Dashboard URL, and list the initial tables before any export or mutation:

   ```bash
   primary_checkout="$(
     git worktree list --porcelain |
       awk '$1 == "worktree" { worktree=$2 } $1 == "branch" && $2 == "refs/heads/main" { print worktree; exit }'
   )"
   cd "$primary_checkout/apps/samebase"
   target_convex_deployment="$(node -e "const fs = require('fs'); const line = fs.readFileSync('.env.local', 'utf8').split(/\\n/).find((entry) => entry.trimStart().startsWith('CONVEX_DEPLOYMENT=')); if (!line) process.exit(2); const raw = line.split('=').slice(1).join('='); console.log(raw.replace(/\\s+#.*$/, '').trim().replace(/^['\\\"]|['\\\"]$/g, '')); ")"
   echo "Target deployment: $target_convex_deployment"
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex dashboard --prod --no-open
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data --prod
   ```

   Require the printed Dashboard URL to match the approved team, project, and deployment. Stop on
   any mismatch.

3. Set `approved_encrypted_ops_dir` to the approved encrypted operations storage directory. Confirm
   that it is mounted and is not inside a Git checkout. Create a production export before the first
   cleanup mutation:

   ```bash
   vault_folder_backup_path="$approved_encrypted_ops_dir/vault-folder-removal-$(date -u +%Y%m%dT%H%M%SZ).zip"
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex export --prod --path "$vault_folder_backup_path"
   ```

   Record the secure backup reference and completion time. Do not attach the export to the pull
   request or change record.

4. Inspect the initial cleanup status:

   ```bash
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex run vault/folderCleanup:getRemovalStatus '{}' --prod
   ```

   This call also proves that the cleanup query is live on the approved target. Stop if the function
   is missing. The expected phase is `assignments` when assignment rows exist, `folders` when
   assignments are empty and folders exist, or `complete` when both tables are empty.

5. While the phase is `assignments`, run one bounded assignment batch at a time:

   ```bash
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex run vault/folderCleanup:deleteAssignmentBatch '{}' --prod
   ```

   Record `rowsDeleted` and `status` after each batch. Stop if the phase moves backwards or the
   result has an unexpected shape.

6. Prove that assignments are empty before any folder deletion:

   ```bash
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex run vault/folderCleanup:getRemovalStatus '{}' --prod
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data ui_vaultFolderAssignments --limit 1 --prod
   ```

   Continue only when `assignmentsEmpty` is `true`, the phase is `folders` or `complete`, and the
   table read returns no rows.

7. While the phase is `folders`, run one bounded folder batch at a time:

   ```bash
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex run vault/folderCleanup:deleteFolderBatch '{}' --prod
   ```

   Record `rowsDeleted` and `status` after each batch. The mutation refuses to run if any assignment
   remains.

8. Prove that both tables are empty before physical table deletion:

   ```bash
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex run vault/folderCleanup:getRemovalStatus '{}' --prod
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data ui_vaultFolderAssignments --limit 1 --prod
   CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data ui_vaultFolders --limit 1 --prod
   ```

   Continue only when the phase is `complete`, both empty fields are `true`, and both table reads
   return no rows. Do not call a cleanup function after the next step.

9. Open the production Dashboard URL from step 2. Confirm that its team, project, and deployment
   still match the approved target. Open **Data** and the overflow menu for
   `ui_vaultFolderAssignments`. Select **Delete table**, not **Clear table**. Type the exact table
   name to confirm the permanent deletion.

10. Verify that the assignment table is absent. Do not run a cleanup function for this proof:

    ```bash
    CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data --prod
    ```

    Stop if `ui_vaultFolderAssignments` is still listed.

11. In the same verified production Dashboard, open the overflow menu for `ui_vaultFolders`. Select
    **Delete table**, not **Clear table**. Type the exact table name to confirm the permanent
    deletion.

12. Verify that both physical tables are absent:

    ```bash
    CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data --prod
    ```

    Stop if `ui_vaultFolderAssignments` or `ui_vaultFolders` is listed.

13. Without deploying any older commit, deploy the narrow follow-up that removes the two tables from
    the schema, removes the old public folder API module, and removes the cleanup module.

14. Record the schema-removal commit and deployment completion. Run the table-list command one last
    time and confirm that both table names remain absent:

    ```bash
    CONVEX_DEPLOYMENT="$target_convex_deployment" CONVEX_DEPLOY_KEY= npx convex data --prod
    ```
