import { describe, expect, it } from "vite-plus/test";
import { array, getterObject, number, optional, string } from "../index.ts";
import type { InferBad, InferGood, InferInput } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

interface ExpectedCategory {
  name: string;
  children: ExpectedCategory[];
}

interface ExpectedCategoryBad {
  name?: "not string";
  children?: (ExpectedCategoryBad | undefined)[];
}

const Category = getterObject({
  name: string,
  get children() {
    return array(Category);
  },
});

type CategoryGood = InferGood<typeof Category>;
type CategoryBad = InferBad<typeof Category>;
type CategoryInput = InferInput<typeof Category>;

assertEqual<CategoryGood, ExpectedCategory>(true);
assertEqual<CategoryBad, ExpectedCategoryBad>(true);
assertEqual<CategoryInput, unknown>(true);

interface ExpectedUser {
  email: string;
  posts: ExpectedPost[];
}

interface ExpectedPost {
  title: string;
  author: ExpectedUser;
}

interface ExpectedUserBad {
  email?: "not string";
  posts?: (ExpectedPostBad | undefined)[];
}

interface ExpectedPostBad {
  title?: "not string";
  author?: ExpectedUserBad;
}

const User = getterObject({
  email: string,
  get posts() {
    return array(Post);
  },
});

const Post = getterObject({
  title: string,
  get author() {
    return User;
  },
});

assertEqual<InferGood<typeof User>, ExpectedUser>(true);
assertEqual<InferGood<typeof Post>, ExpectedPost>(true);
assertEqual<InferBad<typeof User>, ExpectedUserBad>(true);
assertEqual<InferBad<typeof Post>, ExpectedPostBad>(true);

interface ExpectedOptionalNode {
  value: number;
  next?: ExpectedOptionalNode;
}

interface ExpectedOptionalNodeBad {
  value?: "not number";
  next?: ExpectedOptionalNodeBad;
}

const OptionalNode = getterObject({
  value: number,
  get next() {
    return optional(OptionalNode);
  },
});

assertEqual<InferGood<typeof OptionalNode>, ExpectedOptionalNode>(true);
assertEqual<InferBad<typeof OptionalNode>, ExpectedOptionalNodeBad>(true);

describe("getterObject", () => {
  it("parses a self-recursive object", () => {
    expect(
      Category({
        name: "root",
        children: [
          {
            name: "child",
            children: [],
          },
        ],
      }),
    ).toStrictEqual([
      true,
      {
        name: "root",
        children: [
          {
            name: "child",
            children: [],
          },
        ],
      },
    ]);
  });

  it("reports nested failures through the resolved getter schema", () => {
    expect(
      Category({
        name: "root",
        children: [
          {
            name: 123,
            children: [],
          },
        ],
      }),
    ).toStrictEqual([
      false,
      {
        children: [
          {
            name: "not string",
          },
        ],
      },
    ]);
  });

  it("parses mutually recursive getters", () => {
    expect(
      User({
        email: "ada@example.com",
        posts: [
          {
            title: "hello",
            author: {
              email: "ada@example.com",
              posts: [],
            },
          },
        ],
      }),
    ).toStrictEqual([
      true,
      {
        email: "ada@example.com",
        posts: [
          {
            title: "hello",
            author: {
              email: "ada@example.com",
              posts: [],
            },
          },
        ],
      },
    ]);
  });

  it("keeps optional recursive getters optional", () => {
    expect(OptionalNode({ value: 1 })).toStrictEqual([true, { value: 1 }]);

    expect(
      OptionalNode({
        value: 1,
        next: {
          value: 2,
        },
      }),
    ).toStrictEqual([
      true,
      {
        value: 1,
        next: {
          value: 2,
        },
      },
    ]);
  });

  it("resolves getter schemas lazily once", () => {
    let getterCalls = 0;

    const CachedNode = getterObject({
      value: number,
      get next() {
        getterCalls += 1;
        return optional(CachedNode);
      },
    });

    expect(getterCalls).toBe(0);
    expect(CachedNode({ value: 1 })).toStrictEqual([true, { value: 1 }]);
    expect(getterCalls).toBe(1);

    expect(
      CachedNode({
        value: 2,
        next: {
          value: 3,
        },
      }),
    ).toStrictEqual([
      true,
      {
        value: 2,
        next: {
          value: 3,
        },
      },
    ]);
    expect(getterCalls).toBe(1);
  });
});
