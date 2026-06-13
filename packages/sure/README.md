# @samebase/sure

Tiny validation primitives built around four small functions:

- `good(value)`
- `bad(issue)`
- `pure(validator)`
- `sure(validator, meta)`

This package stays generic. App-specific protocols such as route search params should build their
own codecs on top of these validators instead of adding domain concepts here.

## Standard Schema

Every schema created through `sure()`/`pure()` (and therefore everything the built-in factories
return) implements [Standard Schema V1](https://standardschema.dev), so it can be passed directly
to any library that accepts a `StandardSchemaV1` (TanStack Router/Form, tRPC, the AI SDK, ...):

```ts
const user = object({ name: string });

user["~standard"].validate({ name: 1 });
// { issues: [{ message: "not string", path: ["name"] }] }
```

Failures are derived from the schema's `bad` value by `toStandardIssues`: strings become issue
messages, plain objects/arrays become path segments, and `undefined` array slots mean "no issue
here". Raw-function validators stay plain `Sure`s — wrap them with `standard(fn)` to attach the
`~standard` props. The spec types are vendored in `src/standardSpec.ts`; the integration lives in
`src/standard.ts`.

Two things to be aware of:

- As part of this work, `object()`/`array()`/`tuple()` now report `"not object"`/`"not array"`
  for type-mismatched input instead of the message-less `bad({})`/`bad([])` they used to return.
- Sure schemas declare their Standard Schema *input* type as `unknown`, so consumers that type
  the input side (e.g. TanStack Router's `Link` search params) won't enforce it at compile time;
  the output side is fully typed.
