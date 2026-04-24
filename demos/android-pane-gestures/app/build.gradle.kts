plugins {
    id("com.android.application")
}

android {
    namespace = "md.noter.demos.panes"
    compileSdk = 36

    defaultConfig {
        applicationId = "md.noter.demos.panes"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.slidingpanelayout:slidingpanelayout:1.2.0")
    implementation("androidx.viewpager2:viewpager2:1.1.0")
}
