import '../config.dart';

/// Is there a newer build? Asked only when somebody asks.
///
/// Nothing here runs on launch, on a timer, or in the background. The app is
/// online anyway - it is not making a privacy claim by staying quiet - but a
/// sideloaded APK cannot install its own update, so a check the user did not
/// ask for could only ever produce a nag.

/// What the server publishes about the current Android build
/// (`/api/app/android`).
class AppRelease {
  const AppRelease({
    required this.available,
    this.version,
    this.sizeBytes,
    this.sha256,
  });

  factory AppRelease.fromJson(Map<String, dynamic> json) => AppRelease(
        available: json['available'] == true,
        version: json['version'] as String?,
        sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
        sha256: json['sha256'] as String?,
      );

  final bool available;
  final String? version;
  final int? sizeBytes;
  final String? sha256;
}

enum UpdateState {
  /// This build is the published one, or newer than it.
  current,

  /// A newer build is published.
  newer,

  /// The server publishes no build to compare against.
  unpublished,

  /// The question could not be answered. Says nothing about this build.
  failed,
}

class UpdateCheck {
  const UpdateCheck(this.state, {this.version, this.sizeBytes, this.sha256});
  final UpdateState state;
  final String? version;
  final int? sizeBytes;
  final String? sha256;
}

/// Compares two dotted versions numerically. A string compare puts "4.10.0"
/// before "4.9.0", which reads as "you are up to date" to everyone on the
/// newest build - a bug that ships once and confuses people afterwards.
bool isNewerVersion(String remote, String local) {
  List<int> parts(String v) =>
      v.split('.').map((n) => int.tryParse(n.trim()) ?? 0).toList();
  final a = parts(remote);
  final b = parts(local);
  for (var i = 0; i < (a.length > b.length ? a.length : b.length); i++) {
    final x = i < a.length ? a[i] : 0;
    final y = i < b.length ? b[i] : 0;
    if (x != y) return x > y;
  }
  return false;
}

/// A build made outside `apk-publish` carries no release version, so there is
/// nothing to compare and "you are up to date" would be a guess.
bool get isVersionedBuild => AppConfig.appVersion != 'dev';

/// Decides what the published release means for this build. Pure, so the
/// interesting part is testable without a server.
UpdateCheck compareRelease(AppRelease release, String local) {
  final remote = release.version;
  if (!release.available || remote == null || remote.isEmpty) {
    return const UpdateCheck(UpdateState.unpublished);
  }
  if (!isNewerVersion(remote, local)) {
    return UpdateCheck(UpdateState.current, version: remote);
  }
  return UpdateCheck(
    UpdateState.newer,
    version: remote,
    sizeBytes: release.sizeBytes,
    sha256: release.sha256,
  );
}

/// Human size for the download line. Megabytes: an APK is never small enough
/// for bytes to mean anything and never large enough to want gigabytes.
String formatBytes(int? bytes) =>
    bytes == null || bytes <= 0 ? '?' : '${(bytes / 1000000).round()} MB';
