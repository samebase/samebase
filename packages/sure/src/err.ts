import type { InferGood, InferInput, Sure } from './index.ts'

export const err =
  <TSure extends Sure>(schema: TSure) =>
  (input: InferInput<TSure>): InferGood<TSure> => {
    const [good, result] = schema(input)

    if (good) {
      // @ts-expect-error Inferred as `unknown`
      return result
    }

    throw result
  }
