import {
  MetaObj,
  Sure,
  array,
  number,
  spread_NOT_IMPLEMENTED,
  string,
  // eslint-disable-next-line no-unused-vars -- learning scratch
  tuple,
} from "../../index.ts";

// Doesn't work
export type TupleInferGoods01<T> = //
  T extends readonly [infer First, ...infer InferRest]
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- learning scratch
      First extends Sure<unknown, infer Good, any, infer Meta>
      ? Meta extends { parent: typeof spread_NOT_IMPLEMENTED }
        ? // try spreading the rest if it's an array
          Good extends readonly unknown[]
          ? [...Good, ...TupleInferGoods01<InferRest>]
          : // otherwise just return the good
            [Good, ...TupleInferGoods01<InferRest>]
        : [Good, ...TupleInferGoods01<InferRest>]
      : []
    : [];

const sample = [
  //
  string,
  spread_NOT_IMPLEMENTED(array(number)),
  string,
] as const;

type Sample = typeof sample;

// [unknown[]]
// eslint-disable-next-line no-unused-vars -- learning scratch
type Check01 = TupleInferGoods01<Sample>;

// ## Try fixing
export type TupleInferGoods_02<T> = //
  T extends readonly [infer First, ...infer InferRest]
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- learning scratch
      First extends Sure<unknown, infer Good, any, infer Meta>
      ? Meta extends MetaObj<{ parent: typeof spread_NOT_IMPLEMENTED }>
        ? // try spreading the rest if it's an array
          Good extends readonly unknown[]
          ? [...Good, ...TupleInferGoods_02<InferRest>]
          : // otherwise just return the good
            [Good, ...TupleInferGoods_02<InferRest>]
        : [Good, ...TupleInferGoods_02<InferRest>]
      : []
    : [];

// works
// eslint-disable-next-line no-unused-vars -- learning scratch
type Check02 = TupleInferGoods_02<Sample>;

// Check for full tuple
// eslint-disable-next-line no-unused-vars -- learning scratch
const schema = [
  //
  string,
  spread_NOT_IMPLEMENTED(array(number)),
  string,
] as const;
