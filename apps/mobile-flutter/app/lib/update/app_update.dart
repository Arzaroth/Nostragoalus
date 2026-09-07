import '../config.dart';

/// Is there a newer build? Asked only when somebody asks.
///
/// Nothing here runs on launch, on a timer, or in the background. The app is
/// online anyway - it is not making a privacy claim by staying quiet - but a
/// sideloaded APK cannot install its own update, so a check the user did not
/// ask for could only ever produce a nag.

/// The server's 426: this build is below the floor, here is what to do about
/// it. Parsed rather than discarded so the screen can name the version needed
/// and follow the server's own download route.
class ClientRefusal {
  const ClientRefusal({this.minimum, this.downloadUrl});
  final String? minimum;
  final String? downloadUrl;

  /// The refusal, or null when this 426 is not the server's. A captive portal,
  /// proxy or CDN edge can answer 426 too, and blanking a good build over one of
  /// those would be a worse failure than the one this prevents.
  static ClientRefusal? fromBody(Object? body) {
    final data = body is Map ? body['data'] : null;
    if (data is! Map || data['error'] != 'client_too_old') return null;
    return ClientRefusal(
      minimum: data['minimum'] as String?,
      downloadUrl: data['downloadUrl'] as String?,
    );
  }

  String get path => downloadUrl ?? fallbackDownloadPath;
}

/// The fallback download path, used only when the server did not send one. The
/// server owns this route (`ANDROID_DOWNLOAD_PATH`) and hands it to clients in
/// both the release payload and the 426 body, so this is a floor under a bad
/// response, not the source of truth.
const fallbackDownloadPath = '/download/nostragoalus.apk';

/// What the server publishes about the current Android build
/// (`/api/app/android`).
class AppRelease {
  const AppRelease({
    required this.available,
    this.version,
    this.sizeBytes,
    this.sha256,
    this.downloadUrl,
  });

  factory AppRelease.fromJson(Map<String, dynamic> json) => AppRelease(
        available: json['available'] == true,
        version: json['version'] as String?,
        sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
        sha256: json['sha256'] as String?,
        downloadUrl: json['downloadUrl'] as String?,
      );

  final bool available;
  final String? version;
  final int? sizeBytes;
  final String? sha256;
  final String? downloadUrl;
}

enum UpdateState {
  /// This build is the published one, or newer than it.
  current,

  /// A newer build is published.
  newer,

  /// The server publishes no build to compare against.
  unpublished,

  /// This build carries no release version, so there is nothing to compare.
  unversioned,
}

class UpdateCheck {
  const UpdateCheck(this.state, {this.version, this.sizeBytes, this.sha256, this.downloadUrl});
  final UpdateState state;
  final String? version;
  final int? sizeBytes;
  final String? sha256;
  final String? downloadUrl;

  /// Where to get the build, preferring what the server said.
  String get path => downloadUrl ?? fallbackDownloadPath;
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

/// A build made outside `apk-publish` carries no release version.
bool get isVersionedBuild => AppConfig.appVersion != 'dev';

/// Decides what the published release means for this build. Pure, so the
/// interesting part is testable without a server.
UpdateCheck compareRelease(AppRelease release, String local) {
  // `dev` parses as 0, so comparing it would announce an update to every
  // developer build - which is usually AHEAD of the published one.
  if (local == 'dev') return const UpdateCheck(UpdateState.unversioned);
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
    downloadUrl: release.downloadUrl,
  );
}

/// Human size for the download line, in the same mebibytes and to the same one
/// decimal the website's download card uses - a user told to go and verify the
/// digest there must not find a different size for the same file.
String formatBytes(int? bytes) =>
    bytes == null || bytes <= 0 ? '?' : '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
