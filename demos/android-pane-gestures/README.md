# Android Pane Gesture Demos

Small native Android app for comparing three touch-driven pane/page patterns:

- AndroidX `SlidingPaneLayout` list-detail pane sliding.
- AndroidX `ViewPager2` page swiping and snapping.
- A local AOSP Launcher3-inspired `PagedDeckView` custom `ViewGroup`.

## Run

Open this directory in Android Studio, select the `app` run configuration, and
run it on an emulator or USB-connected Android phone.

CLI install, once an emulator or device is visible in `adb devices`:

```bash
cd demos/android-pane-gestures
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew installDebug
```

If your JDK is already on `PATH`, the `JAVA_HOME=...` prefix is not needed.

## What To Try

- **SlidingPaneLayout**: tap rows and drag the detail pane closed/open on a
  phone-width viewport.
- **ViewPager2**: swipe horizontally, toggle vertical mode, and
  disable/re-enable user input.
- **PagedView**: swipe between the full-screen cards; it uses touch slop,
  velocity, and snap thresholds in one readable custom view.

## Source Pointers

- [`SlidingPaneLayout`](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/slidingpanelayout/slidingpanelayout/src/main/java/androidx/slidingpanelayout/widget/SlidingPaneLayout.kt)
- [`ViewPager2`](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/viewpager2/viewpager2/src/main/java/androidx/viewpager2/widget/ViewPager2.java)
- [`Launcher3 PagedView`](https://android.googlesource.com/platform/packages/apps/Launcher3/+/master/src/com/android/launcher3/PagedView.java)
