import { bad } from "./core.ts";
import type { Bad, MetaNever, MetaObj, Primitive, Sure } from "./core.ts";

export type Issue<Error = unknown> = {
  readonly path: readonly PropertyKey[];
  readonly error: Error;
};

export type AnyValidation<Input = unknown> = Sure<
  readonly Issue[],
  unknown,
  Input,
  MetaNever | MetaObj,
  boolean
>;

export function fail<Error extends Primitive>(error: Error): Bad<readonly Issue<Error>[]>;
export function fail<Error>(error: Error): Bad<readonly Issue<Error>[]>;
export function fail<Error>(error: Error): Bad<readonly Issue<Error>[]> {
  return bad([{ path: [], error }]);
}
