import 'dart:async';

import '../api/token_store.dart';

/// Non-secret UI preferences (chosen locale, selected competition, the per-
/// competition league lens), persisted so a Thai or Arabic user does not re-pick
/// their language on every cold start.
/// They live in the same platform keystore as the bearer token because that is
/// the only key/value store the app already depends on.
class AppPrefs {
  AppPrefs([SecureKv kv = const FlutterSecureKv()]) : _kv = kv;

  final SecureKv _kv;
  static const localeKey = 'ng_locale';
  static const competitionKey = 'ng_competition';
  static const leaguesKey = 'ng_leagues';

  String? locale;
  String? competition;
  String? leagueSelections;

  /// Reads both values into memory so the synchronous preference providers can
  /// seed from them. Called once from `main()` before the app boots; a missing
  /// platform keystore (headless tests) simply leaves the defaults.
  Future<void> load() async {
    try {
      locale = await _kv.read(localeKey);
      competition = await _kv.read(competitionKey);
      leagueSelections = await _kv.read(leaguesKey);
    } catch (_) {
      // No keystore available: run with the defaults rather than failing boot.
      locale = null;
      competition = null;
      leagueSelections = null;
    }
  }

  void setLocale(String code) {
    locale = code;
    unawaited(_write(localeKey, code));
  }

  void setCompetition(String? slug) {
    competition = slug;
    unawaited(slug == null ? _delete(competitionKey) : _write(competitionKey, slug));
  }

  void setLeagueSelections(String? json) {
    leagueSelections = json;
    unawaited(json == null ? _delete(leaguesKey) : _write(leaguesKey, json));
  }

  Future<void> _write(String key, String value) async {
    try {
      await _kv.write(key, value);
    } catch (_) {
      // A preference that fails to persist must never break the UI action.
    }
  }

  Future<void> _delete(String key) async {
    try {
      await _kv.delete(key);
    } catch (_) {
      // Same: best effort.
    }
  }
}
