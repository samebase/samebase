import type { AnySure, InferAsync, InferGood, InferInput, Resolve } from "./core.ts";
import { mapResult } from "./async.ts";

export const err =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
  <TSure extends AnySure<any>>(schema: TSure) =>
    (input: InferInput<TSure>): Resolve<InferGood<TSure>, InferAsync<TSure>> => {
      // @ts-expect-error The schema determines the promise and the successful payload type.
      return mapResult(schema(input), ([good, result]) => {
        if (good) {
          return result;
        }

        throw result;
      });
    };
