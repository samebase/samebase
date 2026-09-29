# Templates and components

Status: proposal for discussion. This document does not define shipped behavior.

Date: September 30, 2026.

## Recommendation

Make a template a tested release of a complete app. Keep a catalog of the reusable parts that each
app uses. Let users start with `samebase/base`, start with `samebase/mail`, or take one part into an
existing app.

Use a small checked template definition. Keep build commands in package scripts and resource
configuration in the existing provider files. Keep resource creation in Samebase's Convex workflows.
Use AI to adapt code and prepare changes for review.

The first UI should serve people who create apps in Samebase. The same template and component
details can be public. Keep the selected template when a visitor signs in and selects an
organization.

## What exists today

| Source              | Current state                                                                                                                                                       | Work needed for a template                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `samebase/base`     | `templates/base` is exported to a generated seed manifest and a public repository. New App always uses this manifest.                                               | Add catalog identity, selection, and a stored source revision.                                                           |
| `samebase/mail`     | A working mail app. One Cloudflare Worker serves the app, receives email, and sends replies. R2 stores original messages and attachments. Convex stores mail state. | Replace fixed deployment values. Declare domain, email routing, storage, and owner setup. Extract the planned component. |
| `samebase/samebase` | A private product with workspace packages, provider apps, and billing. Its license does not grant general redistribution.                                           | Prove an independent export and fresh-account setup. Make an explicit license decision before public distribution.       |

Mail is already a useful example, but it is not yet an example of a separately installed component.
Its tables are directly in the app schema. Component extraction and package publication are separate
steps. A local component can work before npm publication.

Evidence:

- [Base export and update contract](../docs/repository-exports.md#starter-base-export).
- [Current create arguments](https://github.com/samebase/samebase/blob/65022cb19abd174500b9472f5b8244cae66aed07/apps/samebase/convex/repository/contracts/createRepository.ts#L14).
- [Seed function](https://github.com/samebase/samebase/blob/65022cb19abd174500b9472f5b8244cae66aed07/apps/samebase/convex/starterSeed.ts#L424),
  which already accepts a manifest.
- [Existing build configuration](https://github.com/samebase/samebase/blob/65022cb19abd174500b9472f5b8244cae66aed07/apps/samebase/convex/repository/model.ts#L48).
- [Stored provisioning plans](https://github.com/samebase/samebase/blob/65022cb19abd174500b9472f5b8244cae66aed07/apps/samebase/convex/repository/provisioningModel.ts#L122).
- [Mail architecture and setup at the checked revision](https://github.com/samebase/mail/blob/1713e40ef644179d3e589457c966186e666f32da/README.md#architecture).
- [Mail schema](https://github.com/samebase/mail/blob/1713e40ef644179d3e589457c966186e666f32da/convex/schema.ts#L40),
  [fixed initial inboxes](https://github.com/samebase/mail/blob/1713e40ef644179d3e589457c966186e666f32da/convex/bootstrap.ts#L5),
  and
  [Worker configuration](https://github.com/samebase/mail/blob/1713e40ef644179d3e589457c966186e666f32da/wrangler.jsonc#L6).
- [Samebase license](../LICENSE.md#proprietary-license).

## What to formalize

There are four different jobs.

| Job                       | Owner                     | Contract                                                                                    |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| Produce template files    | Export script and CI      | Complete output at an immutable revision, with an explicit license.                         |
| Build and check code      | Package scripts and Vite+ | Locked dependencies, build result, type checks, and focused behavior checks.                |
| Create provider resources | Samebase workflows        | Validated inputs, resource ownership, secret references, stored progress, and retry checks. |
| Change an existing app    | Packages and reviewed PRs | Proposed diff, compatibility checks, and explicit acceptance.                               |

Add a template definition with only the information Samebase cannot already read reliably:

1. Identity, description, source location, source root, and license.
2. References to included components, libraries, and integrations.
3. Required connections and user inputs, with reasons and secret classification.
4. References to package scripts and provider configuration files.
5. Required capabilities and a fresh-install verification procedure.

Resolve a published version to an immutable source commit and content digest before creation starts.
Store that resolution on both the repository and its provisioning plan. Store input values needed
for a later update, with secret values kept in the existing credential system. Retries must use the
same source and inputs, even if the catalog changes during a run.

Do not duplicate dependency versions from the lockfile or resource names from Wrangler in a second
file. A validator should reject unsupported requirements before it creates resources. Catalog text
can be edited independently, but must not claim capabilities that have not passed release checks.

The first catalog can be maintained in code and exported during CI. A database for user-published
templates is useful only when publishing and permissions become product requirements.

### Keep build tools small

Package scripts plus Vite+ are enough for the first release. Samebase already stores build, deploy,
preview, root-directory, and watched-path settings. Keep Wrangler as the Cloudflare configuration
source and Convex configuration as the component registration source.

The missing work is mostly provider setup. Mail adds R2, Email Routing, domain checks, owner setup,
and a shared Worker/Convex secret. Add explicit supported actions for those needs. Keep a manual
action in the plan when a provider requires human verification. Do not report that action complete
until the provider confirms it.

A general resource graph or action language would add a second platform to maintain. Reconsider it
only after real templates require dependencies that the typed workflow cannot express clearly.

### Give AI a clear job

AI can inspect an app and draft its template definition. It can recommend a template, add a
component, change UI code, diagnose a failed check, and prepare update PRs.

Deterministic tools must resolve source versions, validate inputs, check provider access, transfer
secrets, create resources, and record results. An AI-generated repair changes the reviewed source or
plan. It must not silently change a running provisioning attempt.

Expose the same template and component records through MCP. Existing agents can use them in their
normal workflow. This proposal does not need a new in-app chat.

## Components and shared defaults

Use one readable "Included" list, with precise types in its details:

- A Convex component owns backend state and exposes an API.
- A library supplies code, such as Convex Auth.
- An integration connects a service, such as PostHog.
- A template demonstrates a complete app made from these parts.

For Mail, extract the reusable backend and keep the Cloudflare email and storage adapter visible. A
Convex component alone does not provide the domain, routing, or R2 setup. Make the example app
consume the packaged component so tests cover the same code that other apps use.

Your PostHog idea is correct as a maintenance policy for official templates. Each new release can
include the same tested analytics setup. Use each app owner's PostHog project. Keep collection
inactive until that project is configured. Adding the code and enabling collection are separate
actions. Review event fields and consent with the integration change.

Use shared packages for behavior that should remain identical. Use tested code changes for files
that an app should own. Avoid copying one template into another at creation time through a chain of
inheritance. Every published template should build independently.

For a shared update:

1. Change the shared package or integration instructions.
2. Update each official template in a branch.
3. Export and check each template in a fresh environment.
4. Publish new immutable template releases.
5. Offer a PR to each existing app that requests the update.

Existing user apps must keep working without an update. A package release can use ordinary
dependency tooling. Changes to app-owned files need a diff that accounts for local edits. Store
source provenance now, but do not promise automatic conflict resolution or complete template sync.
Resource removal is a separate action from a source update.

## UI proposal

Use a short list of templates beside the selected detail. With three entries, a large gallery,
search field, and filters would add work without helping selection.

The detail contains a description, source link, setup action, included parts, and required services.
Each part opens a component detail. That detail links back to its example apps and explains how to
use the part in an existing app. Show publication and readiness states next to the relevant item.

The production entry points should be:

- **New App:** choose a template, then continue to the existing organization and provider setup.
  Preselect Base to preserve the shortest current path.
- **Public Templates:** browse the same details before sign-in. Preserve the selection through
  sign-in. Public entries need public source or an access-aware source link.
- **An existing repository:** ask an agent to add a component using its documented setup. Prepare a
  PR before changing the app. Start with documentation and MCP discovery; add a browser action once
  the install contract is proven.

The final setup screen should show the exact resources, required connections, manual actions, and
cost-relevant services before creation. Keep provider pricing links near choices that affect cost.
During creation, show the current step and any action required. On success, link to the app and
repo. On failure, retain completed resource records and offer a retry of the same plan.

### Options considered

| Direction                                         | Assessment                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Template list with linked component details       | Recommended. It supports both starting an app and finding reusable code.                       |
| Component catalog as the main page                | Useful later. It gives a new user more assembly work before a working app exists.              |
| A component picker that generates any combination | Defer. It needs compatibility rules, composition tests, and clear ownership of generated code. |
| AI-only setup from a repository URL               | Useful for preparation. Provider writes still need a checked plan and reliable retries.        |

## Patterns from other products

These are external observations. The recommendations above are Samebase design decisions.

| Product                                                                                                                              | Verified pattern                                                                                     | What to use                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [GitHub templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) | New repositories get independent history.                                                            | Keep source provenance explicitly if updates matter.                                     |
| [Convex templates](https://www.convex.dev/templates)                                                                                 | Entries link to source and working examples.                                                         | Let users inspect the app before selecting it.                                           |
| [Convex component authoring](https://docs.convex.dev/components/authoring)                                                           | Supports local and npm components. The example should import the bundled component.                  | Develop Mail locally, then publish the package. Test through the real example.           |
| [Cloudflare deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)                                      | Reads Wrangler resources, package scripts, and required secrets.                                     | Reuse native project files. Validate that exports contain their dependencies.            |
| [Railway templates](https://docs.railway.com/templates/create)                                                                       | Describes services, variables, and references between services.                                      | Resolve linked resource values automatically. Consider "Make this app a template" later. |
| [Render Blueprints](https://render.com/docs/infrastructure-as-code)                                                                  | Shows planned resource changes from a checked file. File removal does not imply resource deletion.   | Show a concrete plan and keep deletion explicit.                                         |
| [Backstage templates](https://backstage.io/docs/features/software-templates/writing-templates/)                                      | Declares metadata, inputs, actions, and output links.                                                | Use the clear setup and result structure. Defer its broad action language.               |
| [shadcn registry](https://ui.shadcn.com/docs/registry/registry-item-json) and [MCP](https://ui.shadcn.com/docs/mcp)                  | Registry items declare files and dependencies. Agents discover and install them through tools.       | Give people and agents the same catalog and installation rules.                          |
| [Copier updates](https://copier.readthedocs.io/en/stable/updating/)                                                                  | Uses the saved template version and answers to prepare updates. Conflicts can require manual review. | Record provenance early and deliver updates as reviewable diffs.                         |

Primary source text was checked on September 30, 2026. The research used search results from the
official sites. Core Cloudflare, Convex, shadcn, and Copier claims were also checked against fetched
documentation or its official source. This was a documentation review, not a deployment test of each
external product.

## Suggested order

1. Add selection and source provenance. Keep Base behavior unchanged. Register Mail with an honest
   setup status. Keep Samebase as an advanced reference.
2. Make Mail installable in fresh accounts. Add the supported storage and email setup steps. Extract
   the component and test the app through it.
3. Prove one shared update, such as PostHog, across Base and Mail. Deliver an update PR to an app
   with local changes. Use that evidence to define the update contract.
4. Prepare an independent Samebase export and decide its reuse terms. Use it to test the same
   contract at a larger scale.

Release checks must prove that Base still creates correctly, a retry keeps the selected source
revision, and a partial failure does not duplicate resources. Mail needs incoming-mail, attachment,
reply, and owner-access checks with fresh configuration. Shared updates must preserve app edits and
keep analytics collection inactive until configured.

## Design study in this branch

The interactive study is at `/templates-preview?prod-ui` in local and preview environments. It
reuses Samebase's button, input, theme, and route shell. It is hidden from route suggestions and
blocked on the production environment. It makes no provider writes.

Try selecting all three templates, opening Mail or PostHog from the contents list, following an
example back to its template, and reviewing Mail setup. The setup form records only temporary UI
state. The study shows proposed contents, not an installed-component inventory.

The screenshots in [the study folder](../research/templates-proposal/) are design evidence. They are
not accepted screenshot-test baselines. The PR records the actual checks run.
