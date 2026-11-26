// What a host of the hub needs, on any platform. The README's "Write your own host" shows its use.

// The hub: `makeHandle(registration, part)` gives `(request) => Effect<Response>`, where `part` is
// what `makeConnections` of `./connections` gives, or absent.
export {
  hubLogger,
  makeHandle,
  type CoreServices,
  type PublicRegistration,
  type Registration,
} from "./core/router.ts";
export { cleanupBatch } from "./core/cleanup.ts";
export { CommandFailed } from "./core/command.ts";

// The services a host provides. Time is Effect's `Clock`.
export {
  Fetch,
  HubConfig,
  HubConfigError,
  Keys,
  Random,
  SignInPage,
  type HubConfigInput,
  type ServiceSettings,
} from "./core/services.ts";
export * as Connectors from "./core/connectors/index.ts";
export type { Connector, ConnectorSpec, Secret } from "./core/connectors/types.ts";
export { hubSettings, type HubSettings } from "./hosts/settings.ts";
export { hub, hubRuntime } from "./core/hub.ts";

// The Store and its command contract.
export { Store, StoreUnavailable, type StoreShape } from "./store/Store.ts";
export { decodeCommand } from "./store/commands.ts";
export {
  tableNames,
  tables,
  type Doc,
  type IndexName,
  type TableName,
  type Tables,
} from "./store/tables.ts";
export {
  checkQuery,
  RowId,
  type IndexField,
  type IndexValue,
  type Query,
  type Row,
  type TxShape,
} from "./store/Tx.ts";
export { ensureLayout, sqlTx, type Exec, type SqlValue } from "./store/sql.ts";

// The registration layers. The connections part is in `./connections`.
export { github } from "./layers/github/routes.ts";
export { stack, type StackKey, type StackSettings } from "./layers/stack/routes.ts";
