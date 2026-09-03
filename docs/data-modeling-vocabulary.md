# Data Modeling Vocabulary

This is the approved generic vocabulary for persisted table names and other data-model symbols.
Product and protocol nouns such as `repository`, `branch`, `OAuth`, and `grant` remain open, but
they must refer to one concrete concept everywhere they appear.

The generic vocabulary is closed. A change that needs another generic lifecycle noun must define it
here in the same change, show why an existing term does not fit, and update the affected model names
and comments consistently.

## Naming Rules

1. Name the thing one row represents. A table name should complete the sentence: "This table
   contains many ..."
2. Use an unprefixed plural name for a concrete product, protocol, authorization, synchronization,
   or work-queue concept. Being temporary or mutable does not make a table a workflow table.
3. Use a category prefix only for `workflow_`, `observations_`, `derived_`, `audit_`, or `ui_`.
   `operations_` and `data_` are not categories: the first catches unrelated support state, while
   the second makes primary product facts look like one interchangeable storage class.
4. A prefixed name has the grammar `<category>_<subject>_<rowKind>`. Underscores separate those
   semantic levels; camelCase joins multiple words inside one level. For example,
   `workflow_repositoryProvisioning_runs` means category `workflow`, subject
   `repositoryProvisioning`, and row kind `runs`.
5. Put the subject before the row kind so one feature's tables remain adjacent:
   `workflow_repositoryDeletion_events`, not `workflow_event_repositoryDeletion`.
6. Prefer a concrete product or protocol noun over a generic technical noun.
7. Use one word for one meaning across schema, code, tests, and current documentation.
8. Define non-obvious producers and consumers in the table comment. Name the actual command,
   service, provider, or user action instead of saying only "system", "connector", or "workflow".
9. Use `claim` only as a verb for atomically acquiring a named lock or lease. The stored noun is the
   lock or lease, never a claim.

## Category Prefixes

| Category        | Exact boundary                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflow_`     | Rows whose sole reason to exist is executing, recovering, or inspecting one named multi-step workflow.                                     |
| `observations_` | Provider or remote-system facts captured locally. They are not authoritative Samebase product facts.                                       |
| `derived_`      | Projections that can be rebuilt completely from other local rows.                                                                          |
| `audit_`        | Append-only occurrences that production behavior never reads to authorize a request, choose an action, recover work, or render live state. |
| `ui_`           | Per-user presentation filters, settings, expansions, or layouts that do not define product behavior.                                       |

An event belongs to `workflow_` when live workflow or UI behavior reads it. It belongs to `audit_`
only when removing every event would not change current production behavior.

## Approved Generic Nouns

| Noun         | Exact meaning                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `request`    | Pending demand or approval that a consumer can accept, reject, complete, or expire.                                                      |
| `plan`       | Chosen inputs that execution reads and may reuse. It describes intended work, not the resulting resource.                                |
| `run`        | One execution attempt with its own progress and outcome.                                                                                 |
| `event`      | One ordered occurrence. Say whether production behavior reads it or whether it is audit-only.                                            |
| `lock`       | One exclusive permission for a named actor or run to perform scoped work.                                                                |
| `lease`      | Time-limited permission or activity marker with explicit expiry.                                                                         |
| `credential` | Reusable authentication material. State whether the row stores the secret or its hash.                                                   |
| `token`      | Generated bearer or one-use value with expiry, revocation, or consumption semantics. State whether the row stores the value or its hash. |
| `code`       | A protocol-defined one-use value exchanged for another credential or token.                                                              |
| `rate limit` | Counters for a named key and time window that reject excess requests.                                                                    |
| `update`     | One ordered delta consumed to synchronize another copy of state.                                                                         |
| `snapshot`   | A complete point-in-time copy of external state.                                                                                         |
| `summary`    | A condensed projection computed entirely from other local rows.                                                                          |
| `staging`    | Current persisted work that has not yet been committed to its durable destination.                                                       |
| `filter`     | Persisted UI criteria controlling which results are visible.                                                                             |
| `layout`     | Persisted UI positions or dimensions.                                                                                                    |
| `settings`   | Persisted UI preferences only when no narrower noun fits.                                                                                |

`state` is allowed only as a qualified protocol term, such as OAuth `state`, or for a fully
qualified UI surface when no narrower noun describes the row. Its comment must name the protocol
meaning or the persisted UI choice.

## Terms That Need Replacement

Do not use `target`, `ownership`, `claim`, `handoff`, `item`, `record`, `data`, `history`, or bare
`state` as a generic persisted-row noun. These words describe a relationship or container without
saying what the row is. Replace them with the concrete domain noun or an approved lifecycle noun.
