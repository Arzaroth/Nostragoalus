allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    // Some plugins (flutter_webrtc) still pin an old compileSdk in their own
    // build script; a transitive androidx dep needs >= 34. Registered before
    // evaluationDependsOn so it runs after the plugin's script sets its value.
    afterEvaluate {
        (extensions.findByName("android") as? com.android.build.gradle.BaseExtension)
            ?.let { ext ->
                val current = ext.compileSdkVersion?.substringAfter("android-")?.toIntOrNull()
                if (current == null || current < 34) ext.compileSdkVersion(36)
            }
    }
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
