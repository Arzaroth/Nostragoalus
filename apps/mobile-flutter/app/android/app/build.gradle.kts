import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing material, from android/key.properties (gitignored) or the
// matching env vars. The repo contains no keystore, so an unconfigured checkout
// still builds - it just falls back to the debug key below.
val keyProps = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? =
    keyProps.getProperty(key) ?: System.getenv(env)

val releaseStore = signingValue("storeFile", "NG_ANDROID_KEYSTORE")

android {
    namespace = "com.arzaroth.nostragoalus"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.arzaroth.nostragoalus"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseStore != null) {
            create("release") {
                storeFile = file(releaseStore)
                storePassword = signingValue("storePassword", "NG_ANDROID_STORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "NG_ANDROID_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "NG_ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // The debug keystore is a shared secret every Android SDK ships, so a
            // debug-signed build must never be the identity published in
            // assetlinks.json (any app signed with that key could then claim
            // goal.arzaroth.com's links). It stays the fallback only so
            // `flutter run --release` works without a keystore; App Links
            // verification requires the real one.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
