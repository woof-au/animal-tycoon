import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The Android app is the same game as the Windows and Mac apps: it ships with every release, carries the same version
// number, and packs the very same src/renderer folder (copied in at build time, after `npm run vendor`).
val gameVersion = (JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val parts = gameVersion.split(".").map { it.toInt() }

val copyGame by tasks.registering(Sync::class) {
    from(rootProject.file("../src/renderer")) { exclude("package.json") }
    into(layout.buildDirectory.dir("generated/game/renderer"))
    doFirst {
        check(rootProject.file("../src/renderer/vendor/three.module.js").exists()) { "Run `npm run vendor` in the repo root first." }
    }
}

android {
    namespace = "stream.woofservices.animaltycoon"
    compileSdk = 35

    defaultConfig {
        applicationId = "stream.woofservices.animaltycoon"
        minSdk = 26
        targetSdk = 35
        versionName = gameVersion
        versionCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/game"))

    // Release signing key comes from CI secrets (never in the repo). The same key must sign every version,
    // or Android refuses the update.
    val ks = System.getenv("WOOF_ANDROID_KEYSTORE")
    signingConfigs {
        if (ks != null) create("release") {
            storeFile = file(ks)
            storeType = "pkcs12"
            storePassword = System.getenv("WOOF_ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("WOOF_ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("WOOF_ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (ks != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    androidResources { noCompress += listOf("js", "css", "html") }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

tasks.named("preBuild") { dependsOn(copyGame) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
