# TODO

## High Priority
- [ ] research https://vly.ai/, and all others startups shown on https://www.convex.dev/startups
- [ ] https://www.convex.dev/startups has live video of the browser the ai are using
- [ ] transform the chat from fab to sider from left or right
- [ ] check out https://www.kernel.sh/?utm_source=theo - kernel might be useful
- [ ] flex: it's possible to remove github vault of noter completely and then attach it again and this whole time everything works, since we maintain netlify and convex for you. Currently set to remove in checkboxes
- [ ] fix dark mode/light mode toggle - it's redirecting to /
- [ ] make dragging nice for sidebar on left
- [ ] add settings page for each vault and also for the whole app that allows auto commits
- [ ] when path doesn't have owner or repo name or can't find it, redirect to vaults
- [ ] add command "auto-push" "stop auto push" or similar to allow automatic pushing
- [ ] you don't need to open noter in noter.md, you have it as a fab in your prod, just for you
- [ ] add share functionality to noter.md app - when copying text, allow sharing to Telegram, etc. Create new PWA app for this
- [ ] add backwards and forward buttons
- [ ] always sync input values to Convex so text is remembered on typing (real-time persistence)
- [ ] screenshot support so it can debug itself
- [ ] if new commit button appears, or actually, all previous requests get disabled, can only click last group
- [ ] while waiting for tool, you can still talk with it but it will keep fresh in prompt that it's waiting for tool, no blocking
- [ ] mcp server can be replaced by folder and file. If it's query it can be single expression of convex query. And write here a complex query, as a anonymous with no { ctx.db.query("messages").withIndex("by_vault", q => q.eq("vaultId", args.vaultId)).filter(q => q.and(q.gte(q.field("_creationTime"), args.since), q.or(q.eq(q.field("role"), "user"), q.eq(q.field("role"), "assistant")))).order("desc").take(50)
- [ ] add link to changed files in commit. Also the name of the commit is displayed twice, both in text and in bubble of button
- [ ] add questions at bottom of your messages, make them small, "yes", maybe, no. But the input is always open. That's the thing the input is never waiting. You can even instruct it to stop research
- [ ] the fab is notm click able when sidebar opens. It should have knowledge that it's in the sidebar
- [ ] it's fine to reuse the Sha of the same vault so history should be easy, so we can implement branching easily in noter
- [ ] you don't share code, you share methods how you work with code. Like teach it about type-safety, so senior devs will still be needed, since you need to be technical
- [ ] https://www.deployopenclaw.co/

## Features & Improvements
- [ ] improve file search functionality with better fuzzy matching
- [ ] add keyboard shortcuts for common actions (save, commit, etc.)
- [ ] implement file diff view to show changes before committing
- [ ] add "todo" command functionality for AI assistant to update this file
- [ ] add command "auto-push" "stop auto push" or similar to allows
- [ ] use mermaid?
- [ ] remove the "auto delete GitHub repo" option once repos move to the noter.md org flow
- [ ] show actionable error when delete fails due to missing GitHub `delete_repo` scope, with a re-login CTA
- [ ] When repository name already exists show better error

## Meta/Philosophy
- [ ] the more our tooling for noter gets better (in terms of ai settings or integrations) the more our user's tooling gets better, since we use noter for building noter

## Ideas to Explore
- [ ] check if I discussed this idea: noter could approach darklang because the logs are automatically in convex
- [ ] add idea regarding the jokes about older people don't know how to convert to pdf. But now with noter

## Starter Provisioning Follow-ups
- [ ] make `vaultActions.deleteVault` idempotent for missing docs to avoid repeated "Delete on nonexistent document ID" errors in logs
- [ ] add explicit provisioning logs for `needsRepoPatch` and `existingDeployKeyId` during Netlify repo wiring
- [ ] add integration test for Netlify provisioning order: site create -> env set -> repo patch -> skip manual trigger
- [ ] add retry/backoff around deploy trigger/provisioning calls for transient Netlify/Convex API failures
- [ ] define and document a Convex CLI dependency update cadence for the starter template

## Completed ✅
- [x] when committing, commit all changed files
- [x] allow deleting file/folder
- [x] after commit now, the file should already have a new staging
- [x] add more descriptive commit names
- [x] update the tree from time to time?
- [x] don't use builder.io anymore
- [x] removing noter from builder.io todo is done