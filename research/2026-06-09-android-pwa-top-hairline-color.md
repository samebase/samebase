# Android PWA Top Hairline Color

Date: 2026-06-09

Status: source mapping plus emulator observations. This is not a product spec.

## Question

Noter can set route colors from query params, including `background`, and syncs that background to
the document `theme-color`. The question was whether the app border/separator color can use the same
algorithm as Chrome/Android's top boundary so app separators look related to browser chrome.

## Current Answer

There are two different surfaces:

1. Normal Chrome tab/custom-tab toolbar hairline.
2. Installed PWA `WebappActivity` status/top area.

The normal Chrome toolbar hairline has a source-mapped formula. For a non-default custom toolbar
color, Chromium overlays `#19000000` on light backgrounds and `#19FFFFFF` on dark backgrounds.

The installed PWA path is different. Source mapping shows `WebappActivity` uses the page/tab theme
color for the status/top area while app-mode UI is active. It does not expose a separate stable
"hairline color" formula to mirror. In the Pixel 9a emulator, clean installed-PWA `/logo` captures
showed the top/status area as the route background itself. Seam-like rows visible lower down were
web-route/right-pane UI or Noter's own separator, not a full-width Android/PWA top boundary.

Noter's `background-derived` border therefore uses the source-mapped Chrome toolbar hairline
formula, not the earlier unsupported installed-PWA neutral-gray rule.

## Chrome Toolbar Hairline Formula

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

The overlay is flattened with `ColorUtils.overlayColor(...)`/`getColorWithOverlay(...)` channel
math:

```text
overlayAlpha = 25 / 255
channel = round(base + (overlay - base) * overlayAlpha)
```

Examples for custom theme colors:

```text
background  derived border
white       #E6E6E6
yellow-200  #E6D878
amber-200   #E5CF78
yellow-500  #D8A000
lime-400    #8BCF00
red-500     #FB414A
blue-500    #408CFF
mist-700    #4C5659
black       #191919
```

## Installed PWA Source Path

Installed PWA launches through `WebappActivity`, which extends `BaseCustomTabActivity`.

Relevant Chromium source path:

- `SharedActivityCoordinator.updateUi(boolean)` enables app-mode UI and calls
  `mBrowserServicesThemeColorProvider.setUseTabTheme(useAppModeUi)` plus
  `mStatusBarColorProvider.setUseTabThemeColor(useAppModeUi)`.
- `BrowserServicesThemeColorProvider` observes tab changes including `onDidChangeThemeColor`,
  `onPageLoadFinished`, `onUrlUpdated`, and `onShown`, then updates the top UI theme.
- `CustomTabStatusBarColorProvider.getBaseStatusBarColor(Tab)` returns `UNDEFINED_STATUS_BAR_COLOR`
  for `WEB_PAGE_THEME`, which tells `StatusBarColorController.calculateBaseStatusBarColor()` to use
  the toolbar/page theme color.
- `StatusBarColorController` observes `onDidChangeThemeColor` and calls `updateStatusBarColor()`.

This path supports the status/top area following the page theme color. It does not point to a
separate PWA hairline derivation.

Dynamic route/query changes can still look stale. Chromium's tab theme-color helper can start from
the previous theme color and only reread `WebContents.getThemeColor()` when Blink emits a theme
color change. Same-document or query-only changes should be verified with full-device
`adb screencap`, not Chrome DevTools screenshots, because DevTools captures only web content.

## Emulator Evidence

Environment:

- Device: `Pixel_9a_2` emulator, Android release `17`, `1080x2424`, `420dpi`, portrait.
- Installed PWA activity: `com.android.chrome/org.chromium.chrome.browser.webapps.WebappActivity`.
- Test route: `https://codex-pwa-divider-color-noter-worker.nicuchiciuc.workers.dev/logo`.
- Capture method: full-device `adb exec-out screencap -p`.

Clean installed-PWA `/logo?background=lime-400` with the right pane open:

```text
rows 0..267    #9AE600  route background / status-top area
rows 268..269  #C0E673  right-pane route UI, not full-width PWA chrome
rows 270..301  #9AE600  route background
rows 302..303  #E6E6E6  Noter separator/border row from current app CSS
```

On `/logo`, the right mobile separator is Noter's own pseudo-element:

```css
.workspace-mobile-pane-separators::before,
.workspace-mobile-pane-separators::after {
  width: 1px;
  background: var(--color-border);
}
```

The separator uses `--border`. Before this correction, light backgrounds used the unsupported
neutral `#E6E6E6` rule, which made `yellow-200`, `yellow-500`, and `lime-400` visibly diverge from
the source-mapped Chrome toolbar hairline formula.

## Source Evidence

Chromium:

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
- `BrowserServicesThemeColorProvider` observes page theme-color changes for browser-service
  activities:
  `/Users/nicu/dev/other/pwa-system-bars/chromium-149/chrome__android__java__src__org__chromium__chrome__browser__customtabs__features__toolbar__BrowserServicesThemeColorProvider.java`
- `CustomTabStatusBarColorProvider` delegates page-theme status color to `StatusBarColorController`:
  `/Users/nicu/dev/other/pwa-system-bars/chromium-149/chrome__android__java__src__org__chromium__chrome__browser__customtabs__CustomTabStatusBarColorProvider.java`
- `StatusBarColorController.calculateBaseStatusBarColor()` uses the toolbar/page theme color when no
  status-bar override is supplied:
  `/Users/nicu/dev/other/pwa-system-bars/chromium-149/chrome__android__java__src__org__chromium__chrome__browser__ui__system__StatusBarColorController.java`

Android:

- `DecorView.calculateBarColor(...)` substitutes framework scrims only for transparent requested bar
  colors. Opaque page/theme colors return unchanged:
  `/Users/nicu/dev/other/pwa-system-bars/aosp-frameworks-base-16/core/java/com/android/internal/policy/DecorView.java`
