# Android PWA Top Hairline Color

Date: 2026-06-09

Status: source mapping and runtime observation, not an implementation plan.

## Question

On Android PWA routes, the app can set the browser status bar color through the document
`theme-color` meta tag. After doing that, a narrow line is visible at the top edge of the web
content. The working question was whether this line is Android status bar behavior, Chromium PWA
behavior, or app-rendered UI, and where its color is computed.

## Current Answer

The line observed in the emulator is not an Android framework "status bar divider". Android has a
navigation bar divider API/path, but not an equivalent status bar divider path.

Chromium does have a top-controls hairline in the custom-tab/PWA stack:

1. `WebappActivity` uses the custom-tab activity stack.
2. The custom-tab control container includes `ToolbarHairlineView`.
3. `ToolbarHairlineView` draws `R.drawable.toolbar_hairline`.
4. `toolbar_hairline.xml` is a `1dp` rectangle using `@color/divider_color`.
5. In light mode, Chromium's `divider_color` points to `?attr/colorSurfaceContainerHighest`.
6. In dark mode, Chromium's `divider_color` points to `?attr/colorOutlineVariant`.

The important caveat is that `?attr/colorSurfaceContainerHighest` is not a Chromium algorithm. It is
an Android theme attribute supplied by the Material Components theme layer.

## What `?attr/colorSurfaceContainerHighest` Means

In Android XML, `?attr/colorSurfaceContainerHighest` means "look up the current theme's value for
the `colorSurfaceContainerHighest` attribute." It is closer to a themed design-system variable than
to a function call.

Material Components declares the attr as a tonal surface color role:

```xml
<attr name="colorSurfaceContainerHighest" format="color"/>
```

Material's comment says this is "the container color of surface the most elevated, which replaces
the previous surface variant." In Material vocabulary, a token is a named design role such as
`surface_container_highest`; the theme resolves that role to an actual color.

## Material Resolution Chain

For regular Material 3 themes, Material Components assigns:

```xml
<item name="colorSurfaceContainerHighest">@color/m3_sys_color_light_surface_container_highest</item>
<item name="colorSurfaceContainerHighest">@color/m3_sys_color_dark_surface_container_highest</item>
```

Those system color resources resolve to reference palette tones:

```xml
<color name="m3_sys_color_light_surface_container_highest">@color/m3_ref_palette_neutral90</color>
<color name="m3_sys_color_dark_surface_container_highest">@color/m3_ref_palette_neutral22</color>
```

In the current Material Components source checked locally:

```xml
<color name="m3_ref_palette_neutral90">#ffe6e0e9</color>
<color name="m3_ref_palette_neutral22">#ff36343b</color>
```

For dynamic color themes on Android 12+ (`values-v31`), Material maps the same role to dynamic
neutral-variant palette tones:

```xml
<color name="m3_sys_color_dynamic_light_surface_container_highest">
  @color/m3_ref_palette_dynamic_neutral_variant90
</color>
<color name="m3_sys_color_dynamic_dark_surface_container_highest">
  @color/m3_ref_palette_dynamic_neutral_variant22
</color>
```

For Android 14+ (`values-v34`), Material delegates these to Android framework colors:

```xml
<color name="m3_sys_color_dynamic_light_surface_container_highest">
  @android:color/system_surface_container_highest_light
</color>
<color name="m3_sys_color_dynamic_dark_surface_container_highest">
  @android:color/system_surface_container_highest_dark
</color>
```

Material's Java dynamic-color utility describes the role as:

```java
public DynamicColor surfaceContainerHighest() {
  return new DynamicColor(
      /* name= */ "surface_container_highest",
      /* palette= */ (s) -> s.neutralPalette,
      /* tone= */ (s) ->
          s.isDark
              ? new ContrastCurve(22.0, 22.0, 26.0, 30.0).get(s.contrastLevel)
              : new ContrastCurve(90.0, 90.0, 84.0, 80.0).get(s.contrastLevel),
      ...
}
```

So the source-backed meaning is: use the neutral palette, tone 90 in normal light contrast, tone 22
in normal dark contrast, with adjusted tones under higher contrast settings.

## Android Framework Defaults

The Android 16 framework source checked locally exposes public fallback colors:

```xml
<color name="system_surface_container_highest_light">#E2E2E9</color>
<color name="system_surface_container_highest_dark">#33343A</color>
```

These are framework resource defaults. On dynamic-color-capable devices, Android can replace system
color resources with colors derived from the system color scheme.

## About The 10% Observation

The `10%` value was an empirical observation from a screenshot, not a source-backed algorithm:

```text
background: #00BC7D
observed top line: #00AA71
```

That observed line is consistent with multiplying each RGB channel by roughly `0.9`, or mixing the
background with about 10% black. I have not found a Chromium source constant that says "darken this
PWA top hairline by 10%."

The closest Chromium source constant found in the targeted source set is different:

```java
private static final float DARKEN_COLOR_FRACTION = 0.6f;
```

That constant is used by `ColorUtils.getDarkenedColorForStatusBar(...)`, whose comment says it
darkens a color for the Android status bar. That is a status-bar path, not the Material
`divider_color` path, and `0.6` does not explain the measured `#00AA71` line.

Therefore, do not treat `10%` as the discovered Chromium algorithm. Treat it as a runtime
measurement that may come from another composition path, a tinted/captured toolbar layer, or an
app/content-edge effect.

## Noter-Specific Context

Noter currently maps route search params to CSS variables and the PWA `theme-color` meta tag:

```ts
themeColorMetaElement.content = getTailwindColorHex(readAppThemeColors(search).background);
```

For `/logo?background=emerald-500`, the meta tag becomes `#00BC7D`.

The app also has a separate `border` query param. If absent, `border` stays on the app default
instead of being derived from `background`.

This means there are two different questions:

1. What color does Chrome/Android draw at the PWA top edge?
2. What should Noter use for `--border` when the page background changes by query param?

The Material source chain answers the first question only for Chromium's default
`@color/divider_color` resource. It does not prove that Noter's borders should use that same value,
because the measured green line tracked the app background rather than Material's neutral gray
token.

## Source Evidence

Chromium:

- `custom_tabs_control_container.xml` includes `ToolbarHairlineView`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/chrome/android/java/res/layout/custom_tabs_control_container.xml#24
- `ToolbarHairlineView` draws `R.drawable.toolbar_hairline`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/chrome/browser/ui/android/toolbar/ToolbarHairlineView.java#38
- `toolbar_hairline.xml` uses `@color/divider_color`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/components/browser_ui/styles/android/java/res/drawable/toolbar_hairline.xml#11
- `toolbar_hairline_height` is `1dp`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/components/browser_ui/styles/android/java/res/values/dimens.xml#26
- Light `divider_color` uses `?attr/colorSurfaceContainerHighest`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/components/browser_ui/styles/android/java/res/color/divider_color.xml#8
- Dark `divider_color` uses `?attr/colorOutlineVariant`:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/components/browser_ui/styles/android/java/res/color-night/divider_color.xml#8
- Chromium status-bar darkening constant:
  https://chromium.googlesource.com/chromium/src/+/refs/tags/149.0.7827.110/ui/android/java/src/org/chromium/ui/util/ColorUtils.java#32

Material Components Android, commit `5974002691ea7a4b3209610a98d863eecb5bdfae`:

- Attr declaration:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values/attrs.xml#L107
- Regular theme assignments:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/theme/res/values/themes_base.xml#L233
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/theme/res/values/themes_base.xml#L563
- Regular token values:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values/tokens.xml#L96
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values/tokens.xml#L48
- Android 12+ dynamic token values:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values-v31/tokens.xml#L96
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values-v31/tokens.xml#L45
- Android 14+ framework color delegation:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values-v34/tokens.xml#L92
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/res/values-v34/tokens.xml#L48
- Dynamic color role formula:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/utilities/MaterialDynamicColors.java#L228
- Dynamic color role resource mapping:
  https://github.com/material-components/material-components-android/blob/5974002691ea7a4b3209610a98d863eecb5bdfae/lib/java/com/google/android/material/color/MaterialColorUtilitiesHelper.java#L93

Android framework, `android-vts-16.0_r1` / commit `99b01a65cc4c104933788b3143285ab6bae65827`:

- Framework `system_surface_container_highest_*` fallback values:
  https://android.googlesource.com/platform/frameworks/base/+/99b01a65cc4c104933788b3143285ab6bae65827/core/res/res/values/colors.xml#435
  https://android.googlesource.com/platform/frameworks/base/+/99b01a65cc4c104933788b3143285ab6bae65827/core/res/res/values/colors.xml#485

Noter:

- `background` search param drives the app background variables:
  `apps/noter/src/lib/appThemeColorSearch.ts`
- `border` search param drives the app border variables separately:
  `apps/noter/src/lib/appThemeColorSearch.ts`
- `theme-color` meta tag follows the resolved app background:
  `apps/noter/src/lib/appThemeColorSearch.ts`

## Follow-Up If We Need Exact Runtime Attribution

The remaining unresolved point is why the observed emulator line for `emerald-500` was green-tinted
instead of the Material neutral token. To prove that exact runtime source, the next step should be
instrumentation rather than another broad source sweep:

1. Capture screenshots for several route backgrounds and dark/light modes.
2. Compare the top-line pixel against:
   - `theme-color`
   - Chromium `ColorUtils.getDarkenedColorForStatusBar(theme-color)` (`0.6` HSV value)
   - `theme-color` mixed with black/white at common alpha stops
   - Material `surface_container_highest` values for the emulator theme
3. If the line tracks the app background, inspect Chromium top-controls capture/tint code around
   `ToolbarControlContainer` and browser-services theme updates with a narrower source checkout or a
   local Chromium build/log point.

