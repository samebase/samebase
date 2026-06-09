# Android PWA Top Hairline Color

Date: 2026-06-09

Status: source mapping plus emulator observations. This is not a product spec.

## Question

On Android, Noter sets the browser/PWA system color from the route background through `theme-color`.
A thin line can appear between Chrome's top toolbar/status area and web content, and Noter also
renders pane separator lines. The working question was whether Noter can derive its separator color
from the same algorithm Chromium uses for that line.

## Current Answer

There are two relevant surfaces:

1. Normal Chrome tab/custom-tab toolbar hairline.
2. Standalone PWA `WebappActivity` status/content boundary.

The product target is the installed PWA boundary on Android, not the normal Chrome tab toolbar
hairline. Pixel 9a emulator samples show that the installed PWA boundary uses a different light-side
color than the normal Chrome toolbar hairline.

For light backgrounds, Android framework contrast enforcement explains the constant `#E6E6E6` line:
`DecorView.calculateBarColor(...)` returns `SCRIM_LIGHT = 0xe6ffffff` when the status bar is
transparent, contrast is enforced, and dark status-bar icons are requested. In an emulator
screenshot, that alpha white scrim is flattened as `#E6E6E6`.

For dark backgrounds, Chrome's installed PWA path paints a concrete status-boundary color and Pixel
9a samples match Chromium's `25 / 255` white overlay math. The switch uses Chromium's
`ColorUtils.shouldUseLightForegroundOnBackground(...)` threshold, which is WCAG contrast against
white >= 3.

The app's default background-derived border now follows the installed PWA observations:

```text
background  derived border
white       #E6E6E6
amber-200   #E6E6E6
yellow-200  #E6E6E6
yellow-500  #E6E6E6
gray-400    #E6E6E6
gray-500    #79808E
mist-700    #4C5659
```

In code, that means:

```text
if the background is dark enough to need light foreground:
  overlay #19FFFFFF
else:
  use #E6E6E6
```

The overlay is flattened with Chromium's `ColorUtils.overlayColor(...)` channel math:

```text
overlayAlpha = 25 / 255
channel = round(base + (overlay - base) * overlayAlpha)
```

## Normal Chrome Toolbar Hairline

Chromium computes the normal toolbar/content boundary in `ThemeUtils.getToolbarHairlineColor(...)`:

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

That formula matches normal Chrome's toolbar/content separator. It does not match the installed PWA
boundary samples for `yellow-200` and `yellow-500`, where the installed PWA uses the neutral
`#E6E6E6` line.

## Standalone PWA Boundary

In the installed Chrome `WebappActivity` on the Pixel 9a emulator, the status/content boundary was
at physical rows `142..144`. Surrounding rows were the page background.

```text
background  content   boundary rows
white       #FFFFFF   #E6E6E6
yellow-200  #FFF085   #E6E6E6
amber-200   #FEE685   #E6E6E6
yellow-500  #F0B100   #E6E6E6
gray-400    #99A1AF   #E6E6E6
gray-500    #6A7282   #79808E
red-500     #FB2C36   #FB414A
blue-500    #2B7FFF   #408CFF
mist-700    #394447   #4C5659
black       #000000   #191919
```

`gray-400` and `gray-500` are the useful threshold check: `gray-400` stays on the light-background
side and gets Android's neutral `#E6E6E6`; `gray-500` flips to the dark-background side and gets the
white overlay result.

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

- Device: `Pixel_9a_2` emulator, Android release `17`, `1080x2424`, `420dpi`, portrait.
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

Installed PWA boundary samples in `WebappActivity`:

```text
white-base  line #E6E6E6  content #FFFFFF
yellow-200  line #E6E6E6  content #FFF085
amber-200   line #E6E6E6  content #FEE685
yellow-500  line #E6E6E6  content #F0B100
gray-400    line #E6E6E6  content #99A1AF
gray-500    line #79808E  content #6A7282
mist-700    line #4C5659  content #394447
```

The important result is that the installed PWA boundary is not the normal Chrome toolbar hairline.
For `yellow-200`, normal Chrome shows `#E6D878`; the installed PWA shows `#E6E6E6`.

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

That path is not the toolbar hairline formula. It explains the installed PWA's constant light-side
boundary on Android.

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
