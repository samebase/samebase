# 067 Lightpanda Rendering And Visual Testing Research

## Document Control

- Status: Research note
- Owner: Noter platform/testing
- Last updated: 2026-03-22
- Depends on: none

## Purpose

Evaluate whether Lightpanda is a fit for Noter's browser automation work given
two explicit constraints:

1. we need rendering-dependent coverage for WebGL behavior
2. we need screenshots of whole elements and, in some cases, specific parts of
   rendered elements

This note is intentionally narrow. It does not evaluate Lightpanda as a general
scraping tool. It evaluates whether it can replace or complement the current
Playwright plus Chromium usage in this repository.

## Research Questions

1. Can Lightpanda support WebGL-dependent verification?
2. Can Lightpanda take the kind of screenshots this repo already relies on?
3. If not, is there a practical hybrid model that still makes Lightpanda useful
   here?

## Repo Requirements That Matter

The current repo already depends on real rendering in a few places:

1. [`apps/noter/e2e/visualDiff.ts`](../apps/noter/e2e/visualDiff.ts) captures
   locator screenshots and pixel-diffs them against expected PNGs.
2. [`apps/noter/e2e/repository-media-visual.spec.ts`](../apps/noter/e2e/repository-media-visual.spec.ts)
   captures full page screenshots for visual assertions.
3. [`apps/noter/e2e/public-landing-shell.spec.ts`](../apps/noter/e2e/public-landing-shell.spec.ts)
   explicitly tests the landing logo's WebGL path and its fallback behavior when
   WebGL is unavailable.

Those are not incidental test details. They define the minimum browser feature
set required for any replacement.

## Primary Findings

1. Lightpanda is explicitly designed without graphical rendering.
2. Lightpanda's own guidance says screenshots, PDFs, visual regression testing,
   responsive breakpoint testing, and layout debugging should use headless
   Chrome instead.
3. Lightpanda says selector-based DOM interactions are a fit, but
   layout-dependent interactions are not.
4. Lightpanda Cloud exposes a CDP endpoint that can serve either Lightpanda or
   Google Chrome, so a hybrid setup is supported at the vendor level.
5. Lightpanda is still presented upstream as beta/work in progress, with an
   explicit Playwright compatibility disclaimer.

## WebGL Assessment

Lightpanda is not a fit for WebGL validation in Noter.

I did not find first-party documentation that names WebGL support explicitly.
The recommendation against WebGL is therefore an inference, but it is a strong
one based on first-party statements that Lightpanda does not do CSS processing,
layout calculation, image/font display, or pixel painting.

That matters because Noter's landing-page coverage is not just checking that a
canvas element exists. It checks behavior around a real WebGL-driven scene and a
real no-WebGL fallback path. A browser that intentionally skips graphical
rendering cannot replace Chromium for that work.

## Screenshot Assessment

Lightpanda is not a fit for Noter's current screenshot workflows.

This repo already relies on:

1. locator screenshots for stable diffing
2. page screenshots for visual baselines
3. rendered output that can be cropped or compared at pixel level

Lightpanda's own blog states that pages are not rendered and says directly that
screenshots are a headless Chrome use case. That rules out replacing the
existing Playwright visual suite with Lightpanda.

The same conclusion applies when the screenshot target is only a specific part
of an element. A partial-element screenshot still depends on real layout,
coordinates, and painted pixels before any crop can happen.

## Fit Matrix

| Requirement                                       | Fit with Lightpanda | Basis                                                           |
| ------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| WebGL rendering checks                            | No                  | Inference from no rendering/layout/paint                        |
| Locator or element screenshots                    | No                  | First-party guidance says use Chrome for screenshots            |
| Page screenshots / visual diffs                   | No                  | First-party guidance says use Chrome for visual regression      |
| Coordinate-based or visibility-based interactions | No                  | First-party guidance says no layout-dependent interactions      |
| Selector-based DOM interaction                    | Maybe yes           | First-party guidance says selector-based interactions are a fit |
| Non-visual form/workflow automation               | Maybe yes           | CDP compatibility is the intended use case                      |

## Recommendation

1. Do not replace the current Playwright plus Chromium coverage with Lightpanda
   for any workflow that depends on WebGL, layout, or screenshots.
2. If we want to evaluate Lightpanda at all, scope it to non-visual automation
   only:
   - DOM-driven checks
   - form workflows
   - scraping or extraction tasks
   - behavior assertions that do not depend on pixels
3. If we want a single provider surface, the only viable rendering path in the
   current Lightpanda offering is the documented hybrid approach: connect over
   their CDP endpoint with `browser=chrome` for rendering-required jobs.
4. For Noter specifically, that means Lightpanda is at most a complementary
   engine, not a replacement for the repo's existing visual and WebGL test
   surface.

## Practical Next Step

If there is a real non-visual browser task we want to optimize for startup time
or memory, run a small pilot against Lightpanda with a narrow pass/fail bar:

1. no visual assertions
2. no coordinate-based interactions
3. no screenshots
4. no WebGL expectations

Until that pilot exists, the simplest correct decision is to keep Chromium as
the default engine for current Noter browser automation.

## Source Links

### Primary sources

1. Lightpanda docs introduction: <https://lightpanda.io/docs/>
2. Lightpanda CDP docs: <https://lightpanda.io/docs/cloud-offer/tools/cdp>
3. Lightpanda blog, "What Is a True Headless Browser?":
   <https://lightpanda.io/blog/posts/what-is-a-true-headless-browser>
4. Lightpanda GitHub README: <https://github.com/lightpanda-io/browser>

### Repo references

1. [`apps/noter/e2e/visualDiff.ts`](../apps/noter/e2e/visualDiff.ts)
2. [`apps/noter/e2e/repository-media-visual.spec.ts`](../apps/noter/e2e/repository-media-visual.spec.ts)
3. [`apps/noter/e2e/public-landing-shell.spec.ts`](../apps/noter/e2e/public-landing-shell.spec.ts)
