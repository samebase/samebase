// The command `alchemy-convex stack-comment`: one comment on a pull request with the stacks of the
// repository, read from the state store after the deploys.
//
// A stack sees only itself, so a comment that a stack declares cannot show the other stacks of the
// repository. This command runs as a step after them and reads each stack named `owner/name` or
// `owner/name/<folder>` that has the stage `pr-<number>`. A stack without that stage has no card. A
// run replaces the whole body, so the last run shows the newest state.
//
// The rows of a card are the boxes of `stageDiagram` from `@samebase/alchemy-kit/stack`, the model
// of Samebase's stack diagram. Alchemy state holds secrets in clear text, and that model keeps no
// secret of a row.
//
// GitHub keeps a fixed set of HTML in a comment and removes `style` and `class`, so every choice of
// the markup is a fact about the sanitizer or the CSS of github.com:
// - A table has `display: block` and `width: max-content`, so a `width` on it does nothing. The
//   spacer, a floated image one pixel high in a block of its own, gives every card one width, and
//   it shrinks on a narrow page.
// - The CSS colors the even rows of a group, so each row has its own `tbody`.
// - An HTML block ends at a blank line, so a table has none and is not indented.
// - A bare image links to its raw file, and one link around an image and text underlines the space
//   between them, so the icon and the name are two links to one place.
// - An image with `height` gets a gray background, so each icon is square and has only `width`.
// - `align="middle"` is `-webkit-baseline-middle` in Chrome, which is below the text.
//   `align="absmiddle"` is the CSS value `middle`.
import { State } from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RUN_RECORD_KEY, runRecord } from "@samebase/alchemy-kit/run-record";
import {
  boxSubtitle,
  lineSummary,
  stageDiagram,
  type DiagramBox,
  type DiagramLine,
  type StageDiagram,
} from "@samebase/alchemy-kit/stack";

/** The first text of the comment, which finds it again. */
const MARKER = "<!-- samebase-stacks -->";

/** GitHub does not proxy this host, so a new icon needs no purge of its image cache. */
const ICONS =
  "https://raw.githubusercontent.com/samebase/samebase/main/packages/alchemy-convex/assets/stack-comment";

const GITHUB_API = "https://api.github.com";

/** The fields of the run record that a card shows. */
const StageOutput = Schema.Struct({
  [RUN_RECORD_KEY]: Schema.Struct({
    headCommit: Schema.String,
    runUrl: Schema.NullOr(Schema.String),
    recordedAt: Schema.String,
  }),
});

export interface StackCard {
  readonly name: string;
  readonly stage: string;
  readonly diagram: StageDiagram;
  readonly run: typeof StageOutput.Type | null;
}

export class StackCommentError extends Schema.TaggedError<StackCommentError>()(
  "StackCommentError",
  { reason: Schema.String },
) {
  override get message() {
    return `The stack comment cannot be updated: ${this.reason}`;
  }
}

/** The cards of the stacks of `repository` that have `stage`, in name order. */
export const readStackCards = ({ repository, stage }: { repository: string; stage: string }) =>
  Effect.gen(function* () {
    const state = yield* yield* State;
    const names = (yield* state.listStacks()).filter(
      (name) => name === repository || name.startsWith(`${repository}/`),
    );
    const cards: StackCard[] = [];
    for (const name of names) {
      if (!(yield* state.listStages(name)).includes(stage)) {
        continue;
      }
      const request = { stack: name, stage };
      const rows = yield* Effect.forEach(yield* state.list(request), (fqn) =>
        state.get({ ...request, fqn }).pipe(Effect.map((row) => ({ fqn, state: row }))),
      );
      const output = yield* state.getOutput(request);
      cards.push({
        name,
        stage,
        diagram: stageDiagram(rows),
        run: Schema.is(StageOutput)(output) ? output : null,
      });
    }
    return cards;
  });

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const link = (href: string, text: string) => `<a href="${escapeHtml(href)}">${text}</a>`;

const hostOf = (url: string) => escapeHtml(new URL(url).host);

/** The icon file of a resource type, in `ICONS`. A box of any other type has no icon. */
const ICON_FILES = new Map([
  ["Convex.Deployment", "convex"],
  ["Cloudflare.Worker", "worker"],
  ["Cloudflare.R2.Bucket", "r2"],
]);

/** The name of a box, as a link to its dashboard page when it has one. */
const boxName = ({ name, resourceType, rows: [first] }: DiagramBox) => {
  const icon = ICON_FILES.get(resourceType);
  const image =
    icon === undefined
      ? null
      : `<img src="${ICONS}/${icon}.svg" width="16" align="absmiddle" alt="">`;
  const text = `<b>${escapeHtml(name)}</b>`;
  const href = first.dashboard?.href;
  if (href === undefined) {
    return image === null ? text : `${image} ${text}`;
  }
  return image === null ? link(href, text) : `${link(href, image)} ${link(href, text)}`;
};

/**
A row of a card: the name of a box, its type and schedule, its link unless it is the stage address,
and the boxes that it uses.
*/
const boxRow = (box: DiagramBox, address: string | null, lines: readonly DiagramLine[]) => {
  const details = [
    escapeHtml(boxSubtitle(box)),
    ...(box.link === null || box.link === address ? [] : [link(box.link, hostOf(box.link))]),
    ...lineSummary(box, lines).map(escapeHtml),
  ];
  return `${boxName(box)}${details.map((text) => `<br><sub>${text}</sub>`).join("")}`;
};

/** Where a stage serves: its Convex app, else the first box with a link. */
const addressOf = ({ boxes }: StageDiagram) =>
  (boxes.find((box) => box.resourceType === "Convex.Deployment") ?? boxes.find((box) => box.link))
    ?.link ?? null;

const runLine = ({ run }: StackCard) => {
  if (run === null) {
    return "";
  }
  const { headCommit, recordedAt, runUrl } = run[RUN_RECORD_KEY];
  const commit = escapeHtml(headCommit.slice(0, 7));
  const time = `${recordedAt.slice(0, 16).replace("T", " ")} UTC`;
  return `<br><sub>${runUrl === null ? commit : link(runUrl, commit)} ${escapeHtml(time)}</sub>`;
};

const SPACER = `<div><img src="${ICONS}/spacer.svg" width="460" align="left" alt=""></div>`;

/** `alone`: the one card of the repository. A card at the root then has no folder, as on the repository page. */
const renderCard = (card: StackCard, repository: string, alone: boolean) => {
  const folder = card.name.slice(repository.length + 1);
  const heading = [
    folder === "" && alone ? "" : `<b>${escapeHtml(folder || "/")}</b> `,
    `<sub>${escapeHtml(card.stage)}</sub>`,
  ].join("");
  const address = addressOf(card.diagram);
  const addressLine = address === null ? "" : `<br>${link(address, hostOf(address))}`;
  const rows = card.diagram.boxes
    .map((box) => `<tbody><tr><td>${boxRow(box, address, card.diagram.lines)}</td></tr></tbody>`)
    .join("\n");
  return `<table>
<tbody><tr><td>${SPACER}${heading}${addressLine}${runLine(card)}</td></tr></tbody>
${rows}
</table>`;
};

export const renderStackComment = (cards: readonly StackCard[], repository: string) => `${MARKER}
${cards.map((card) => renderCard(card, repository, cards.length === 1)).join("\n\n")}
`;

const Comments = Schema.Array(Schema.Struct({ id: Schema.Number, body: Schema.String }));
const SavedComment = Schema.Struct({ html_url: Schema.String });

const github = (token: string, path: string, init: { method: string; body?: string }) =>
  Effect.tryPromise({
    try: async (): Promise<unknown> => {
      const response = await fetch(`${GITHUB_API}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    },
    catch: (error) =>
      new StackCommentError({
        reason: `GitHub ${init.method} ${path} failed (${error instanceof Error ? error.message : String(error)})`,
      }),
  });

const decode =
  <S extends Schema.Codec<unknown, unknown>>(schema: S, what: string) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(() => new StackCommentError({ reason: `GitHub gave a bad ${what}` })),
    );

const findComment = (token: string, path: string) =>
  Effect.gen(function* () {
    for (let page = 1; ; page += 1) {
      const comments = yield* github(token, `${path}?per_page=100&page=${page}`, {
        method: "GET",
      }).pipe(Effect.flatMap(decode(Comments, "comment list")));
      const comment = comments.find(({ body }) => body.startsWith(MARKER));
      if (comment !== undefined || comments.length < 100) {
        return comment;
      }
    }
  });

/** Replaces the body of the comment of this command, or posts it on the first run, and gives its URL. */
export const saveStackComment = (args: {
  readonly token: string;
  readonly repository: string;
  readonly pullRequest: number;
  readonly body: string;
}) =>
  Effect.gen(function* () {
    const { body, pullRequest, repository, token } = args;
    const comments = `/repos/${repository}/issues/${pullRequest}/comments`;
    const comment = yield* findComment(token, comments);
    const reply = yield* comment === undefined
      ? github(token, comments, { method: "POST", body: JSON.stringify({ body }) })
      : github(token, `/repos/${repository}/issues/comments/${comment.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        });
    const saved = yield* decode(SavedComment, "comment")(reply);
    return saved.html_url;
  });

/** The step of a workflow: the run record names the repository and the pull request of the run. */
export const updateStackComment = Effect.gen(function* () {
  const { pullRequest, repository } = yield* runRecord({ cwd: process.cwd(), env: process.env });
  if (pullRequest === null) {
    return yield* new StackCommentError({ reason: "this run has no pull request" });
  }
  const token = process.env["GITHUB_TOKEN"];
  if (token === undefined || token === "") {
    return yield* new StackCommentError({ reason: "GITHUB_TOKEN is not set" });
  }
  const cards = yield* readStackCards({ repository, stage: `pr-${pullRequest}` });
  return yield* saveStackComment({
    token,
    repository,
    pullRequest,
    body: renderStackComment(cards, repository),
  });
});
