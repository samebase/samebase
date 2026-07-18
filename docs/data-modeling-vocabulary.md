# Data Modeling Vocabulary

This is the approved generic vocabulary for persisted table names and other data-model symbols.
Product and protocol nouns such as `vault`, `branch`, `OAuth`, and `grant` remain open, but they
must refer to one concrete concept everywhere they appear.

The generic vocabulary is closed. A change that needs another generic lifecycle noun must define it
here in the same change, show why an existing term does not fit, and update the affected model names
and comments consistently.

## Naming Rules

1. Name the thing one row represents. A table name should complete the sentence: "This table
   contains many ..."
2. Put the domain before the row role. For supporting Convex tables, put the lifecycle prefix first:
   `operations_vaultProvisioningRuns`, not `operations_runsForVaultProvisioning`.
3. Prefer a concrete product or protocol noun over a generic technical noun.
4. Use one word for one meaning across schema, code, tests, and current documentation.
5. Define non-obvious producers and consumers in the table comment. Name the actual command,
   service, provider, or user action instead of saying only "system", "connector", or "workflow".
6. Use `claim` only as a verb for atomically acquiring a named lock or lease. The stored noun is the
   lock or lease, never a claim.

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

Do not use bare `connector` in a model comment. In the connected-machine domain, the machine
connector is specifically the local `samebase-sync run` process. Prefer the command name and say
what it sends or receives.
