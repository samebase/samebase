# Carpet shuffle hover study

## Question

Can one shuffled depth-one tile stay self-similar while hover reveals deeper copies of the same
motion?

## Prototype

The study is available at `/logo/hover/carpet?auto-shuffle&depth=3&dev`.

It uses one vacant-cell move:

1. One square leaves its source cell.
2. The square moves into the current vacant cell.
3. The source becomes the next vacant cell after docking.
4. Each revealed square contains the same live move at the next depth.

Hover does not start or stop the shuffle. Hover reveals depths two and three. The shuffle study uses
the `grow` mechanic by default. The `slide` mechanic remains available for comparison.

## Result

The recursive ownership rule works. The moving large square keeps the same moving carpet pattern
inside it before, during, and after docking.

The visual result is not a good landing-page direction. Repeating the displacement at each revealed
depth creates too many competing openings. The `slide` mechanic makes the rectangular trails more
prominent. The `grow` mechanic is calmer, but the full recursive motion is still visually noisy.

## Decision

Keep the 2D route as a research experiment. Do not move this rule into the 3D landing logo. Remove
the rejected 3D implementation and its tests. Revisit the study only if a new displacement rule can
keep one clear moving subject while deeper detail stays subordinate.
