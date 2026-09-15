# Mobile build toolchain and native ownership

Status: **proposed for discussion**

This note records why the Android build should follow Expo's supported version
matrix for now, what that decision costs, and which broader workflow decision we
still need to make. It intentionally does not change build behavior.

## Executive summary

Pull request [#14](https://github.com/Baldros/codex-mobile-app/pull/14)
demonstrated that upgrading the Gradle wrapper independently from Expo and React
Native is unsafe. Gradle 9.7.1 embeds Kotlin 2.4 metadata, while the Gradle
plugins shipped by Expo SDK 57 and React Native 0.86 are compiled with Kotlin
2.1 and cannot read it. The build therefore fails while compiling build plugins,
before any application code is compiled.

The short-term decision proposed in #14 is:

- keep Gradle 9.3.1, the version generated for Expo SDK 57;
- use the latest compatible Expo 57 patch set and React Native 0.86.3;
- treat Expo's dependency matrix as a coordinated toolchain rather than upgrade
  Gradle, Kotlin, React Native, and Expo independently;
- reject compiler-suppression flags, patched files in `node_modules`, and
  unreleased framework versions as production fixes.

This preserves a reproducible, supported build. It does not settle whether the
repository should continue owning native projects directly or adopt Continuous
Native Generation (CNG). That is the main question for this PR.

## What Gradle is doing here

Gradle is not only downloading Android dependencies. It is the Android build
runtime and task orchestrator. The Android Gradle Plugin, the React Native Gradle
Plugin, and Expo's Gradle/autolinking plugins all execute inside it. Those plugins
configure compilation, JavaScript bundling, native-code builds, resources,
packaging, signing, and APK/AAB production.

The Gradle wrapper in the repository pins that runtime so local builds and CI use
the same version. React Native distributes its Gradle plugin with the
`react-native` package, and Expo distributes additional build plugins with its
packages. As a result, the wrapper version cannot be chosen independently from
the Kotlin and plugin versions shipped by those frameworks.

This is normal in Android development: Gradle, the Android Gradle Plugin, Kotlin,
the JDK, and framework build plugins form a compatibility matrix. Frameworks such
as Expo narrow that matrix further because they generate and test a particular
native template for each SDK release.

## What failed with Gradle 9.7.1

The failure is a build-plugin ABI mismatch, not an application defect:

1. Gradle 9.7.1 loads Kotlin 2.4.0 libraries into the build runtime.
2. Expo SDK 57 and React Native 0.86 build plugins use the Kotlin 2.1 compiler.
3. That compiler can read metadata only through Kotlin 2.2.
4. Plugin compilation fails with `Class ... was compiled with an incompatible
   version of Kotlin` before the app is compiled.

The same boundary is documented in
[Expo issue #49550](https://github.com/expo/expo/issues/49550). The report
reproduces the failure on Gradle 9.5 and 9.7.1 and confirms that Gradle 9.3.1 is
compatible. This is why bypassing the metadata check would be a risky workaround:
it would suppress the compatibility guard without making the plugin bytecode and
runtime genuinely compatible.

## What staying on Gradle 9.3.1 costs

It does **not** remove React Native or Android application features by itself.
The app can still use the Android SDK level, Hermes, the React Native New
Architecture, native modules, and release packaging selected by the supported
Expo 57 template. Gradle's version mostly affects build-time capabilities, not
the JavaScript or native APIs available at runtime.

We do defer improvements introduced after 9.3.1, including Gradle 9.7's broader
Configuration Cache compatibility, incubating Isolated Projects support,
Resilient Sync, richer problem locations, and other build-performance and
diagnostic fixes. We may also be unable to adopt a future Android Gradle Plugin
that declares a newer Gradle minimum until Expo and React Native move with it.

Those are real costs, but most are build productivity and future migration costs;
they are not evidence that today's APK is missing a product capability. The
9.7.1 Isolated Projects feature is also incubating and not enabled by default.
The supported stack gives us predictable builds while the framework plugins catch
up.

The successful #14 validation used the proposed stable matrix and completed:

- `expo install --check` with no dependency mismatch;
- TypeScript compilation;
- all four test suites and 12 tests;
- a full Android debug APK build across the configured ARM and x86 ABIs;
- 20 of 21 Expo Doctor checks.

The remaining Doctor warning is not a Gradle failure. It exposes a separate
ownership problem described below.

## The current ownership ambiguity

This repository commits `mobile/android`, so native files are persistent source.
It also keeps native-facing values and plugins in `mobile/app.json`, and the build
guide instructs developers to run Expo Prebuild. Expo warns about this combination
because, when native directories are present, EAS Build does not regenerate them
and app-config changes are not guaranteed to be synchronized into the committed
native project.

That creates two possible sources of truth:

- `app.json` and config plugins;
- files under `mobile/android`.

Without an explicit policy, a developer can change one side, see the JavaScript
configuration look correct, and still ship stale native configuration. Running
Prebuild over hand-edited native files can create the inverse problem: generated
changes may overwrite or layer on top of manual customizations.

## Viable approaches

### 1. Keep committed native projects

Treat `mobile/android` (and a future `mobile/ios`) as source of truth. Continue
using the Expo SDK and React Native Gradle plugins, but perform native upgrades
with the Expo Native Project Upgrade Helper and review each generated diff.

Benefits:

- explicit control over native customizations;
- conventional Android Studio debugging and reviewable native diffs;
- no need to convert existing native changes into config plugins first.

Costs:

- the team owns template upgrades and configuration drift;
- `app.json` fields that affect native code require a documented synchronization
  rule;
- framework upgrades are more manual.

### 2. Adopt CNG and Expo Prebuild as the source of truth

Move durable native configuration into `app.json` and versioned config plugins,
then stop committing generated native directories. Prebuild regenerates those
directories from the template associated with the installed Expo SDK.

Benefits:

- framework upgrades replace a generated template instead of requiring many
  hand-maintained native edits;
- a single declarative configuration can cover Android and iOS;
- less orphaned native setup when dependencies are removed.

Costs:

- all intentional native customizations must be expressible and tested as config
  plugins or other supported extension points;
- generated native diffs are less visible in ordinary code review;
- `prebuild --clean` can delete manual edits, so the migration must inventory them
  first.

CNG changes who owns the native files; it does **not** replace Gradle. Generated
Android projects still use Gradle for compilation and packaging.

### 3. Replace Gradle with another build system

Bazel or Buck2 could theoretically orchestrate parts of an Android build, but
this would not be a drop-in replacement for this stack. We would need to recreate
or bridge the behavior supplied by the Android, React Native, and Expo Gradle
plugins, including autolinking, code generation, Metro bundling, CMake integration,
resources, variants, and packaging. The project would also leave the primary path
tested by the React Native and Expo ecosystems.

Maven is likewise not an equivalent replacement for the Android Gradle Plugin.
For this project's size and current requirements, replacing Gradle would create a
new build-platform maintenance burden without addressing the immediate framework
compatibility issue.

EAS Build is build infrastructure and orchestration, not an alternative Android
build system. It still generates or consumes a native Android project and invokes
its Gradle build.

## Proposed policy

Until this discussion chooses a native-ownership model:

1. Keep committed native directories authoritative.
2. Pin the Gradle wrapper to the version in the stable Expo template for the
   installed SDK.
3. Use `expo install --fix`, `expo install --check`, and Expo Doctor to align the
   JavaScript/native dependency matrix.
4. Use the Native Project Upgrade Helper when moving between Expo SDK releases.
5. Do not merge standalone Gradle, Android Gradle Plugin, Kotlin, or React Native
   major/minor bumps unless the complete matrix builds and is supported together.
6. Record intentional Expo Doctor exceptions with an owner and an exit condition.
7. Validate upgrades with typechecking, tests, a full APK build, and a device
   smoke test of startup, SSH transport, streaming, and reconnect behavior.

## Upgrade triggers

Re-evaluate the wrapper as soon as all of these are true:

- the next stable Expo SDK supports a React Native version whose build plugin is
  compatible with the newer Gradle-embedded Kotlin;
- Expo's stable template selects or supports the target Gradle version;
- the corresponding Android Gradle Plugin and JDK matrix is documented;
- Expo Doctor and `expo install --check` pass, except for a deliberately accepted
  ownership warning;
- the native template diff has been reviewed;
- CI, a full local APK build, and device smoke tests pass without metadata-skip
  flags or patches in installed packages.

The Gradle 9.3.1 build currently emits deprecation warnings about eventual Gradle
10 incompatibility. Those warnings are another migration trigger, not a reason to
skip directly to an unsupported wrapper.

## Questions this PR should resolve

1. Should `mobile/android` remain durable source, or should the project migrate to
   CNG and generated native directories?
2. Which existing Android customizations must be converted into config plugins
   before CNG would be safe?
3. Which fields belong in `app.json` when native directories remain committed,
   and how will synchronization be enforced?
4. Should the build guide continue asking developers to run Prebuild in the
   committed-native workflow?
5. What release cadence should trigger coordinated Expo/React Native/Gradle
   upgrades?
6. Do measured build times justify Configuration Cache or Isolated Projects work
   after the supported matrix advances?

## References

- [Expo: Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [Expo: Native project upgrade helper](https://docs.expo.dev/bare/upgrade/)
- [Expo: upgrade an SDK](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [React Native Gradle Plugin](https://reactnative.dev/docs/react-native-gradle-plugin)
- [Gradle 9.7.1 release notes](https://docs.gradle.org/9.7.1/release-notes.html)
- [Gradle compatibility matrix](https://docs.gradle.org/9.7.1/userguide/compatibility.html)
- [Expo SDK 57 Kotlin/Gradle incompatibility report](https://github.com/expo/expo/issues/49550)
