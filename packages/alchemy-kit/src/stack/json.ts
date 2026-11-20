import * as Schema from "effect/Schema";

/** An object of a state row, such as its `attr` or `props`. Its fields depend on the resource type. */
export type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Unknown));

/** `value` when it is an object other than an array, else an empty object, so a field reads as absent. */
export const asRecord = (value: unknown): JsonRecord =>
  isRecord(value) && !Array.isArray(value) ? value : {};

export const readString = (record: JsonRecord, key: string) => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

/** The items of `value` when it is an array, else none. */
export const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
