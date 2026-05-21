/**
 * Compile-time type assertion helper. It intentionally does nothing at runtime.
 */
export const expectType =
  <Expected>() =>
  <Actual>(
    value: Actual,
    input: Expected extends Actual ? (Actual extends Expected ? true : never) : never,
  ) => {
    void value;
    void input;
  };
