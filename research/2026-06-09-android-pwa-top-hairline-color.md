# Android PWA Top Hairline Color

Date: 2026-06-09

Status: source mapping plus emulator observations. This is not a product spec.

## Question

On Android, Noter sets the browser/PWA system color from the route background through `theme-color`.
A thin line can appear between Chrome's top toolbar/status area and web content, and Noter also
renders pane separator lines. The working question was whether Noter can derive its separator color
from the same algorithm Chromium uses for that line.

## Current Answer

There are two different surfaces:

1. Normal Chrome tab/custom-tab toolbar hairline.
2. Standalone PWA `WebappActivity` status/content boundary.

The source-backed formula is the normal Chrome toolbar hairline formula. Chromium computes it in
`ThemeUtils.getToolbarHairlineColor(...)`:

```text
if toolbarColor is Chrome's default toolbar color:
  use Chrome's semantic divider color
else if ColorUtils.shouldUseLightForegroundOnBackground(toolbarColor):
  overlay #19FFFFFF
else:
  overlay #19000000
```

`ColorUtils.shouldUseLightForegroundOnBackground(...)` uses WCAG contrast against white:

```text
relativeLuminance =
  0.2126 * linear(red) +
  0.7152 * linear(green) +
  0.0722 * linear(blue)

contrastWithWhite = 1.05 / (relativeLuminance + 0.05)
useLightForeground = contrastWithWhite >= 3
```

`ColorUtils.overlayColor(...)` then flattens the transparent overlay. The effective channel formula
is:

```text
overlayAlpha = 25 / 255
channel = round(base + (overlay - base) * overlayAlpha)
```

Examples for non-default, custom theme colors:

```text
#FFF085 -> #E6D878
#F0B100 -> #D8A000
#394447 -> #4C5659
#000000 -> #191919
```

The old Noter implementation only darkened by 10%. That happened to match yellow samples, but it was
wrong for dark colors. `mist-700` (`#394447`) should lighten to `#4C5659`, not darken.

## Standalone PWA Boundary

The standalone PWA status/content boundary does not behave like a single visible hairline across all
colors. In the installed Chrome `WebappActivity` on the phone emulator, away from app pane
separators:

```text
background  theme-color  top content row(s)
white       #FFFFFF      #E6E6E6
yellow-200  #FFF085      #FFF085
yellow-500  #F0B100      #F0B100
mist-700    #394447      #4C5659
```

So for `yellow-200` and `yellow-500`, there was no separate standalone-PWA horizontal top line to
match; the safe top rows were the background itself. For `white`, the top row was the 10%-black
overlay result. For `mist-700`, the top row was the 10%-white overlay result.

The PWA source path I found passes the status bar color through rather than applying the toolbar
hairline formula. In edge-to-edge mode, Chromium delegates bar coloring to an edge-to-edge layout,
and that layout paints the supplied color. Android framework status-bar contrast enforcement applies
only in transparent status-bar cases and is disabled by Chromium when the edge-to-edge helper owns
the color.

## Noter Separator

The visible mobile pane edge is the workspace mobile separator layer, not the desktop `md:border-l`
or `md:border-r` border. At phone width the Tailwind desktop border computes to `0px`.

In code, the separator is a 1px pseudo-element:

```css
.workspace-mobile-pane-separators::before,
.workspace-mobile-pane-separators::after {
  width: 1px;
  background: var(--color-border);
}
```

That separator uses the same `--border` token as desktop borders. In the inspected emulator state,
the separator element's computed `box-shadow` was `none`; the visible shadow-like edge was the
painted pseudo-element.

## Emulator Evidence

Environment:

- Device: `Medium_Phone` emulator, `1080x2400`, `420dpi`, portrait.
- Chrome DevTools target: `http://127.0.0.1:5174/logo?...`.
- Standalone target: `com.android.chrome/org.chromium.chrome.browser.webapps.WebappActivity`.
- Normal Chrome target: `com.android.chrome/org.chromium.chrome.browser.ChromeTabbedActivity`.

Normal Chrome toolbar hairline, sampled at physical x=639 and y=209..214:

```text
yellow-200
  toolbar/content row: #FFF085
  hairline rows:       #E6D878

yellow-500
  toolbar/content row: #F0B100
  hairline rows:       #D8A000

mist-700
  toolbar/content row: #394447
  hairline rows:       #4C5659
```

For `white-base`, normal Chrome used its default-toolbar branch rather than the custom-theme overlay
branch:

```text
white-base
  toolbar/default row: #FAF8FE
  hairline rows:       #E1E2ED
  content row:         #FFFFFF
```

Standalone PWA right-pane separator samples after scrolling the workspace carousel so the right pane
is visible. DOM geometry placed the visible separator at physical x=324 and a safe right-pane
background sample at x=639.

```text
yellow-200
  safe top rows:  #FFF085
  separator rows: #E6D878

yellow-500
  safe top rows:  #F0B100
  separator rows: #D8A000

mist-700
  safe top rows y=63..65: #4C5659
  safe content below:     #394447
  separator rows:         #4C5659

white-base
  safe top rows y=63..65: #E6E6E6
  safe content below:     #FFFFFF
  separator rows:         #E6E6E6
```

The important result is that Noter's separator should mirror the Chrome themed-toolbar hairline
algorithm for custom theme colors. That makes it match the normal Chrome hairline and also fixes the
dark PWA case. It cannot make a yellow standalone-PWA horizontal line appear, because that line was
not present away from the app separator in the observed `WebappActivity`.

## Source Mapping

### Toolbar Hairline Formula

`ToolbarLayout` tints `R.id.toolbar_hairline` using `ThemeUtils.getToolbarHairlineColor(...)`.

`ThemeUtils.getToolbarHairlineColor(...)`:

- returns Chrome semantic divider color for the default toolbar color.
- uses `R.color.toolbar_hairline_overlay_light` for dark toolbars that need light foreground.
- uses `R.color.toolbar_hairline_overlay_dark` for light toolbars that need dark foreground.
- passes the toolbar color and overlay color to `ColorUtils.overlayColor(...)`.

The overlay resources resolve to:

```xml
<color name="toolbar_hairline_overlay_dark">@color/baseline_neutral_0_alpha_10</color>
<color name="toolbar_hairline_overlay_light">@color/baseline_neutral_100_alpha_10</color>

<color name="baseline_neutral_0_alpha_10">#19000000</color>
<color name="baseline_neutral_100_alpha_10">#19FFFFFF</color>
```

`ColorUtils.overlayColor(...)` multiplies the overlay alpha by the optional fraction, strips the
overlay to an opaque color, and calls `getColorWithOverlay(...)`. `getColorWithOverlay(...)` rounds
each interpolated channel.

### Android Framework Contrast

Android framework status-bar contrast is in `DecorView.calculateBarColor(...)`.

Relevant constants:

```java
SCRIM_LIGHT = 0xe6ffffff
SCRIM_ALPHA = 0xcc000000
```

That path is not the toolbar hairline formula. It applies in transparent status-bar contrast cases,
not when Chromium paints a concrete PWA status-bar color through its edge-to-edge helper.

## Source Evidence

Chromium:

- `ToolbarLayout#setToolbarHairlineColor(...)` calls `ThemeUtils.getToolbarHairlineColor(...)`:
  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/ui/android/toolbar/java/src/org/chromium/chrome/browser/toolbar/top/ToolbarLayout.java#673
- `ThemeUtils#getToolbarHairlineColor(...)` chooses the default divider or the light/dark 10%
  overlay:
  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/ui/android/theme/java/src/org/chromium/chrome/browser/theme/ThemeUtils.java
- Toolbar overlay resources:
  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/ui/android/theme/java/res/values/colors.xml
- Palette values for `#19000000` and `#19FFFFFF`:
  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/android/java/res/values/color_palette.xml
- `ColorUtils.overlayColor(...)`, `getColorWithOverlay(...)`, and
  `shouldUseLightForegroundOnBackground(...)`:
  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/android/java/src/org/chromium/ui/util/ColorUtils.java

Android:

- `DecorView.calculateStatusBarColor(...)` and `calculateBarColor(...)`:
  https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/policy/DecorView.java
- `Window#setStatusBarContrastEnforced(...)`:
  https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/view/Window.java

Noter:

- `background` and `border` search params resolve to app CSS color tokens:
  `apps/noter/src/components/logo/logoTailwindColors.ts`
- `theme-color` follows the resolved app background: `apps/noter/src/lib/appThemeColorSearch.ts`
- Mobile pane separators use `var(--color-border)`: `apps/noter/src/index.css`
