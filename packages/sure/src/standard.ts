import type { Issues, MetaNever, MetaObj, Sure } from "./core.ts";

/**
The Standard Schema interface (version 1), as `standard` returns it.

Structurally the same as `StandardSchemaV1<unknown, TGood>` from `@standard-schema/spec`,
so this package does not depend on it.
@see https://standardschema.dev
 */
export type StandardSchema<TGood> = {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "sure";
    readonly validate: (value: unknown) =>
      | { readonly value: TGood; readonly issues?: undefined } //
      | { readonly issues: Issues };
    readonly types?: { readonly input: unknown; readonly output: TGood };
  };
};

/**
Makes a validator usable wherever a Standard Schema is expected.

Accepts the validators that take an `unknown` value and report `Issues`,
which are all the validators of this package.
 */
export function standard<TGood>(
  schema: Sure<Issues, TGood, unknown, MetaObj | MetaNever>,
): StandardSchema<TGood> {
  return {
    "~standard": {
      version: 1,
      vendor: "sure",
      validate: (value) => {
        const [good, unsure] = schema(value);

        return good ? { value: unsure } : { issues: unsure };
      },
    },
  };
}
