import { v } from "convex/values";
import { COMMIT_CONFLICT_REASONS } from "../shared/commitConflicts";

const { union, literal } = v;

const commitConflictReasonLiterals = COMMIT_CONFLICT_REASONS.map((reason) =>
  literal(reason),
);

const [
  firstCommitConflictReasonLiteral,
  secondCommitConflictReasonLiteral,
  ...remainingCommitConflictReasonLiterals
] = commitConflictReasonLiterals;

export const commitConflictReasonValidator = union(
  firstCommitConflictReasonLiteral,
  secondCommitConflictReasonLiteral,
  ...remainingCommitConflictReasonLiterals,
);
