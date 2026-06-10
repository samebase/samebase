# @samebase/sure

Tiny validation primitives built around small functions:

- `good(value)`
- `bad(issue)`
- `pure(validator)`
- `sure(validator, meta)`
- `standard(schema)` to attach Standard Schema `~standard` support to schemas that accept `unknown`
  input

This package stays generic. App-specific protocols such as route search params should build their
own codecs on top of these validators instead of adding domain concepts here.
