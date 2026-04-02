# Convex Spreadsheet Interface Research

Date: 2026-04-03

## Why This Document Exists

This memo evaluates whether Convex data can be piped directly into Excel or
Google Sheets, with the stronger product idea that a spreadsheet could become a
real interface for operating Convex-backed data.

The motivating intuition is sound: spreadsheets are already reactive,
collaborative, and comfortable for operators. Convex is also a reactive data
system. The key question is whether the spreadsheet products expose enough of
that reactivity to act like thin clients for Convex instead of just export
targets.

## Working Definition

For this research, a useful spreadsheet interface would support most of these
behaviors:

1. Show a live or near-live slice of Convex data without repeated manual export.
2. Let operators edit approved fields in a familiar grid.
3. Preserve Convex as the system of record and business-logic layer.
4. Keep auth, approval, and audit boundaries explicit.
5. Avoid building a second hidden application entirely inside spreadsheet code.

## What Convex Gives Us

Official Convex docs point to three important building blocks:

1. Queries are subscribable and receive real-time updates in Convex clients.
2. Actions can call third-party APIs.
3. HTTP actions can expose Convex-backed endpoints to external tools.

That means Convex can support all three spreadsheet integration shapes we would
care about:

1. `pull`: spreadsheet code calls Convex over HTTP
2. `push`: Convex actions write into a spreadsheet API
3. `round-trip`: spreadsheet edits call a narrow Convex write endpoint

The important limitation is that Convex reactivity does not automatically carry
over to arbitrary spreadsheet products. The spreadsheet has to expose its own
live-update mechanism. If it only supports formulas, triggers, or scheduled
refresh, the overall system becomes polling or sync based even if Convex itself
is realtime.

## Google Sheets Findings

Google Sheets is the easier product to use as an operator surface, but it is not
a true Convex-style reactive client.

### What Works Well

1. Apps Script can call external HTTP endpoints and the Google Sheets API can
   update sheets in batches.
2. Installable triggers and time-driven jobs give us workable automation hooks.
3. Google Sheets is naturally collaborative and easy to share with small teams.
4. Distribution is simple compared with packaging an Excel add-in.

### What Breaks The "Live Convex Client" Dream

1. Apps Script custom functions behave like formulas, not full app clients. They
   cannot write to arbitrary cells and must finish quickly.
2. Trigger execution is constrained. Simple triggers are capped at short
   runtimes, and API-driven updates do not recursively fire spreadsheet edit
   triggers.
3. The Sheets API applies batched requests atomically, but collaborative edits
   can still change the final visible state around those updates.
4. In practice, the product shape is sync plus workflow, not subscription plus
   live invalidation.

### Practical Architecture For Sheets

The strongest Google Sheets shape is not "connect the sheet directly to Convex's
reactive query engine." It is:

1. Convex remains canonical.
2. Convex exposes a narrow read model through HTTP actions.
3. Convex actions or scheduled jobs push approved slices into a sheet.
4. Sheet edits flow back through explicit write actions, ideally from a custom
   menu, sidebar, or controlled trigger path.
5. Row ids, version stamps, and last-synced timestamps prevent accidental blind
   overwrites.

That would give us a useful spreadsheet interface, but it would still be an
eventually consistent integration. It would feel more like "Google Sheets as a
shared operations console" than "Google Sheets as a native Convex client."

## Excel Findings

Excel splits into two very different categories:

1. Power Query and Office Scripts are strong automation tools, but they are
   mostly refresh and workflow oriented.
2. Office Add-ins with custom functions are the only spreadsheet path in this
   research that actually gets close to Convex's live reactive model.

### Power Query And Office Scripts

Power Query can pull web data into Excel and refresh it. Office Scripts can
automate workbook updates and can be invoked from Power Automate. This is good
for read models, batch workflows, and scheduled reporting.

The catch is that Office Scripts have important external-call constraints:

1. External API calls are supported only from the Excel application, not from
   Power Automate under normal circumstances.
2. OAuth2 flows are not available inside Office Scripts, and credentials have to
   be managed outside the script.

So Office Scripts are useful glue, but not a great place to build a secure,
bidirectional Convex integration.

### Excel Add-Ins Are The Closest Technical Match

Excel custom functions support shared runtime add-ins and coauthoring. Microsoft
also documents streaming custom functions, which means Excel can maintain live
updating cells backed by a long-running data source.

That matters because it makes this sentence technically true:

> Excel can be made into a genuinely reactive client, not just a refreshable
> report, if we are willing to ship and maintain an Office add-in.

This is the closest spreadsheet analogue to Convex's subscription model in the
official product surfaces I reviewed.

### Why Excel Still Is Not The Obvious First Move

Even though Excel has the strongest technical ceiling, it also has the heaviest
product and distribution cost:

1. We would need an Office add-in, not just a script.
2. Add-in auth, deployment, and environment management are meaningfully more
   complex than a bound Google Sheet.
3. The operator experience is better for teams already living in Microsoft 365,
   but weaker as a lightweight shared interface for mixed environments.

So Excel is the best answer if the goal is "build a spreadsheet-native reactive
client." It is not obviously the best answer if the goal is "give operators a
fast, low-friction table UI next quarter."

## Integration Options

### Option 1: Read-Only Spreadsheet Mirrors

Convex pushes curated tables into Sheets or Excel-oriented exports.

Pros:

- safest auth model
- easy to explain
- useful for reporting and lightweight operations

Cons:

- not really an interface
- no controlled write-back path

### Option 2: Google Sheets As A Thin Operations Console

Use Google Sheets for collaborative editing of approved rows and columns, backed
by Convex HTTP actions and server-side sync.

Pros:

- lowest distribution friction
- easy multi-user collaboration
- easiest near-term path to a spreadsheet interface

Cons:

- eventual consistency instead of true realtime subscriptions
- trigger and runtime limits shape the product
- write-back auth must be designed carefully

### Option 3: Excel As A True Reactive Client

Build an Office add-in that subscribes to Convex data and updates custom
functions or workbook state live.

Pros:

- best conceptual match for Convex
- strongest route to "reactive spreadsheet app"
- could preserve spreadsheet-native formulas and analysis workflows

Cons:

- highest implementation and support cost
- significantly heavier auth and deployment model
- much larger surface area than the Google Sheets path

## Recommendation

Use Google Sheets as the first spreadsheet interface, but be honest about what
it is.

Recommended posture:

1. Treat Google Sheets as a thin collaborative operations surface, not as a
   native Convex client.
2. Keep business logic, validation, authorization, and audit trails in Convex.
3. Expose only narrow, task-specific HTTP actions and read models to the sheet.
4. Start with server-to-sheet sync plus explicit write-back actions for a small
   number of approved workflows.
5. Include immutable row ids, version fields, and sync metadata from day one.

In repo terms, this direction also matches the standing preference to keep
application logic in Convex and use external tools as interfaces, not as hidden
second backends.

## Suggested V1 Shape

If we decide to prototype this, the most credible first slice is:

1. Pick one narrow table-shaped workflow such as approvals, inventory, or a
   triage queue.
2. Add a Convex read model that returns a deterministic, spreadsheet-friendly
   row shape.
3. Add a Convex action that mirrors that row set into a dedicated Google Sheet.
4. Add a controlled write-back endpoint that accepts row id, changed fields,
   version, and actor metadata.
5. Use a sheet-bound Apps Script menu or sidebar for writes instead of relying
   entirely on ambient edit triggers.
6. Log every write-back in Convex so the spreadsheet never becomes the audit
   source of truth.

## Decision Summary

- If we want the easiest path to a spreadsheet interface, choose Google Sheets.
- If we want the closest thing to a true reactive spreadsheet client, choose an
  Excel add-in.
- If we want something shippable soon, Google Sheets is the better first bet.
- If we later prove the workflow and still want deeper spreadsheet-native live
  behavior, Excel add-ins are the serious second-phase path.

## Sources

Official sources reviewed on 2026-04-03:

- Convex Functions overview:
  [https://docs.convex.dev/functions](https://docs.convex.dev/functions)
- Convex Understanding / reactivity overview:
  [https://docs.convex.dev/understanding](https://docs.convex.dev/understanding)
- Google Apps Script custom functions:
  [https://developers.google.com/apps-script/guides/sheets/functions](https://developers.google.com/apps-script/guides/sheets/functions)
- Google Apps Script triggers:
  [https://developers.google.com/apps-script/guides/triggers](https://developers.google.com/apps-script/guides/triggers)
- Google Sheets API `batchUpdate`:
  [https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
- Microsoft Office Scripts overview:
  [https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)
- Microsoft Office Scripts external API calls:
  [https://learn.microsoft.com/en-us/office/dev/scripts/develop/external-calls](https://learn.microsoft.com/en-us/office/dev/scripts/develop/external-calls)
- Microsoft Run Office Scripts with Power Automate:
  [https://learn.microsoft.com/en-us/office/dev/scripts/develop/power-automate-integration](https://learn.microsoft.com/en-us/office/dev/scripts/develop/power-automate-integration)
- Microsoft Excel custom functions overview:
  [https://learn.microsoft.com/en-us/office/dev/add-ins/excel/custom-functions-overview](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/custom-functions-overview)
- Microsoft Receive and handle data with custom functions:
  [https://learn.microsoft.com/en-us/office/dev/add-ins/excel/custom-functions-web-reqs](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/custom-functions-web-reqs)
- Microsoft Support Power Query data sources in Excel versions:
  [https://support.microsoft.com/en-us/office/power-query-data-sources-in-excel-versions-e9332067-8e49-46fc-97ff-f2e1bfa0cb16](https://support.microsoft.com/en-us/office/power-query-data-sources-in-excel-versions-e9332067-8e49-46fc-97ff-f2e1bfa0cb16)

## Source Notes

- The recommendation that Google Sheets is better for a first interface is an
  inference from the official capability surfaces, not a direct claim from any
  one vendor doc.
- The recommendation that Excel is the strongest long-term route for a truly
  reactive spreadsheet client depends on using Office Add-ins with custom or
  streaming functions, not just Power Query or Office Scripts.
- This memo should be revalidated before implementation because Google,
  Microsoft, and Convex can all change product capabilities, quotas, and auth
  constraints over time.
