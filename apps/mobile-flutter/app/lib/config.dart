/// Runtime config. Override the API base at launch:
///   flutter run --dart-define=API_BASE=https://goal.arzaroth.com
/// Android emulator reaches the host machine at 10.0.2.2 (not localhost); a real
/// device or prod uses the public URL. The web app's dev server is on :3000
/// (prod behind a proxy on :3333, but the app talks to the public host).
class AppConfig {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// The server's WebSocket hub (server/routes/_ws.ts) - live + voice signaling.
  static String get wsUrl => '${apiBase.replaceFirst('http', 'ws')}/_ws';

  /// Public web origin for shareable landing links (a/p/s/[token], invites). In
  /// dev the API base is a LAN IP, so share links still point at the real site.
  static const webBase = String.fromEnvironment(
    'WEB_BASE',
    defaultValue: 'https://goal.arzaroth.com',
  );
}
