// What a host of the broker needs, on any platform. The README's "Write your own host" shows its
// use.

// The broker: `makeHandle(registration, part)` gives, once at start, the handler
// `(request) => Effect<Response>`, where `registration` is one layer or a list, and `part` is what
// `makeIntegrations` of `./integrations` gives, or absent.
export {
  brokerLogger,
  makeHandle,
  type CoreServices,
  type PublicRegistration,
  type Registration,
  type Resolve,
  type ResolveRefusal,
} from "./core/router.ts";
export { cleanupBatch } from "./core/cleanup.ts";
export { CommandFailed } from "./core/command.ts";

// The services a host provides. Time is Effect's `Clock`.
export {
  Fetch,
  BrokerConfig,
  BrokerConfigError,
  Keys,
  Random,
  SignInPage,
  type BrokerConfigInput,
  type ServiceSettings,
} from "./core/services.ts";
export type { Connector, ConnectorSpec, Secret } from "./core/connectors/types.ts";
export { brokerSettings, type BrokerSettings } from "./hosts/settings.ts";
export { identityBroker, brokerRuntime } from "./core/identityBroker.ts";

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
