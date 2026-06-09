# Android PWA Top Hairline Color

Date: 2026-06-09

Status: source mapping plus emulator observations. This is not a product spec.

## Question

On Android, Noter sets the browser/PWA system color from the route background through `theme-color`.
A thin line can appear at the top edge of the web content, and Noter also renders pane divider
lines. The working question was whether Noter can derive its divider color from the same algorithm
Chromium uses for the top line.

## Current Answer

There are two different surfaces:

1. Chrome tab/custom-tab toolbar hairline.
2. Standalone PWA `WebappActivity` status/content boundary.

The Chrome tab/custom-tab toolbar hairline has a source-backed formula for theme-colored toolbars:
Chromium overlays a transparent black color on the toolbar/theme color:

```text
overlay = #19000000
alpha   = 25 / 255
result  = round(interpolate(baseChannel, 0, 25 / 255))
        = round(baseChannel * 230 / 255)
```

Examples:

```text
#FFF085 -> #E6D878
#FEE685 -> #E5CF78
#F0B100 -> #D8A000
#00BC7D -> #00AA71
#FFFFFF -> #E6E6E6
```

That matches the app's current background-derived divider color for the tested light/mid colors.

The standalone PWA top boundary on the phone emulator does not behave like a single toolbar hairline
for all colors. In the installed `WebappActivity` at normal phone geometry, away from app pane
dividers:

```text
background  theme-color  top content row(s)
white       #FFFFFF      #E6E6E6
yellow-200  #FFF085      #FFF085
yellow-500  #F0B100      #F0B100
mist-700    #394447      #4C5659
```

So for `yellow-200` and `yellow-500`, there was no separate visible native horizontal top line to
match; the top rows were the background itself. For `white`, the top row matched the 10%-black
toolbar-hairline color. For dark `mist-700`, the top row was lighter than the background, while
Noter's current divider color is darker than the background.

## Noter Divider Correction

On the mobile workspace view, the visible pane edge is not `border-left`. The right pane still has
the Tailwind class `md:border-l md:border-border`, but at phone width its computed
`border-left-width` is `0px`.

The visible mobile pane divider is the pseudo-element in `apps/noter/src/index.css`:

```css
.workspace-mobile-pane-separators::before,
.workspace-mobile-pane-separators::after {
  width: 1px;
  background: var(--color-border);
}
```

That pseudo-element uses the same `--border` token as desktop borders. It is not a CSS `box-shadow`;
computed `box-shadow` on the inspected pane and pseudo-element was `none`.

In one emulator run, programmatic scroll made the right pane visible while the runtime still
reported `data-mobile-pane="main"`. In that state the right pane remained "inactive" and therefore
showed `workspace-mobile-pane-separators`. That is useful for measuring the rendered separator
color, but it should not be described as a settled active-right-pane state.

## Emulator Evidence

Environment:

- Device: `Medium_Phone` emulator, `1080x2400`, `420dpi`, portrait.
- Foreground activity: `com.android.chrome/org.chromium.chrome.browser.webapps.WebappActivity`.
- URL target: `http://127.0.0.1:5174/logo?...`.
- Right-pane target: public right sidebar supplied by `AppWorkspaceShell`.

Pixel samples were taken from adb screenshots after forcing the right pane into view through the
Chrome DevTools Protocol and recording DOM geometry from the same target.

For the visible mobile pane separator at physical `x=324`, with safe background samples inside the
right pane at `x=702`:

```text
yellow-200
  safe top rows: #FFF085
  separator rows: #E6D878

yellow-500
  safe top rows: #F0B100
  separator rows: #D8A000

mist-700
  safe top rows y=63..65: #4C5659
  safe content below:     #394447
  separator below:        #343E40

white
  safe top rows y=63..65: #E6E6E6
  safe content below:     #FFFFFF
  separator below:        #E6E6E6
```

The important result is that the app separator color and the standalone PWA top boundary are not a
single matching algorithm across colors. They match for `white`; for yellow there is no separate
native top line away from the separator; for dark mist they diverge.

## Source Mapping

### Toolbar Hairline Resource

Chromium's toolbar control container includes `ToolbarHairlineView`. The view draws
`R.drawable.toolbar_hairline`; that drawable is a 1dp rectangle using `@color/divider_color`.

The `@color/divider_color` resource resolves to Material theme attrs by default:

```xml
<selector xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:color="?attr/colorSurfaceContainerHighest"/>
</selector>
```

That XML is not the color-mixing formula for theme-colored browser-service toolbar pixels. It is the
default themed divider resource. `?attr/colorSurfaceContainerHighest` is a Material theme attribute:
the current Android theme resolves it to a concrete color role, often a neutral tonal surface.

### Effective Theme-Colored Toolbar Formula

Chromium's `ColorUtils.overlayColor(baseColor, overlayColor)` computes:

```java
float alphaAdjustedFraction = Color.alpha(overlayColor) / 255f * fraction;
return getColorWithOverlay(baseColor, opaqueOverlayColor, alphaAdjustedFraction);
```

`getColorWithOverlay` rounds each interpolated channel. With `#19000000`, that is
`round(channel * 230 / 255)`.

Normal Chrome tab emulator checks for `toolbar_hairline` matched this formula:

```text
yellow-200: #FFF085 -> #E6D878
amber-200:  #FEE685 -> #E5CF78
yellow-500: #F0B100 -> #D8A000
```

## Product Implication

If the desired product behavior is "match Chrome's theme-colored toolbar hairline", the current
background-derived divider formula is the right family for the tested light/mid colors.

If the desired product behavior is "match the standalone PWA top content boundary", there is no
single divider formula to copy from the emulator evidence. Standalone PWA top rows are background
for yellow, 10%-black-like for white, and lightened for dark mist. That would require a separate
context-specific rule, not the current global `--border` derivation.

## Source Evidence

Chromium:

- `ToolbarHairlineView` draws `R.drawable.toolbar_hairline`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/chrome/browser/ui/android/toolbar/ToolbarHairlineView.java#38
- `control_container.xml` includes `@id/toolbar_hairline`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/chrome/browser/ui/android/toolbar/java/res/layout/control_container.xml
- `toolbar_hairline.xml` uses `@color/divider_color` and `toolbar_hairline_height`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/components/browser_ui/styles/android/java/res/drawable/toolbar_hairline.xml
- Light `divider_color` uses `?attr/colorSurfaceContainerHighest`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/components/browser_ui/styles/android/java/res/color/divider_color.xml#8
- `ColorUtils.overlayColor` and `getColorWithOverlay`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/ui/android/java/src/org/chromium/ui/util/ColorUtils.java

Material Components Android:

- `colorSurfaceContainerHighest` attr and Material dynamic color role:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values/attrs.xml#L107
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/utilities/MaterialDynamicColors.java#L228

Noter:

- `background` and `border` search params resolve to app CSS color tokens:
  `apps/noter/src/components/logo/logoTailwindColors.ts`
- `theme-color` follows the resolved app background: `apps/noter/src/lib/appThemeColorSearch.ts`
- Mobile pane separators use `var(--color-border)`: `apps/noter/src/index.css`
