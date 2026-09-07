import 'dart:convert';

/// Competition slug -> selected league id. The Dart side of the web's
/// `ng-league` cookie (`apps/web-nuxt/app/utils/league-cookie.ts`): one map, so
/// switching competition restores that competition's own lens.
typedef LeagueSelections = Map<String, String>;

/// The key a null competition slug stores under. The server resolves its own
/// default competition when the app has never picked one, and that default has
/// no slug on this side to key by.
const defaultCompetitionKey = '';

String _key(String? slug) => slug ?? defaultCompetitionKey;

/// The league lens for [slug], or null for the everyone view.
String? selectedLeagueFor(LeagueSelections map, String? slug) => map[_key(slug)];

/// Immutable update; a null [id] clears that competition's lens.
LeagueSelections withLeagueSelection(LeagueSelections map, String? slug, String? id) {
  final next = LeagueSelections.from(map);
  if (id == null) {
    next.remove(_key(slug));
  } else {
    next[_key(slug)] = id;
  }
  return next;
}

/// Drops a stored lens the user can no longer use (left, kicked, deleted).
LeagueSelections pruneLeagueSelection(
    LeagueSelections map, String? slug, List<String> validIds) {
  final selected = map[_key(slug)];
  if (selected == null || validIds.contains(selected)) return map;
  return withLeagueSelection(map, slug, null);
}

/// Tolerates anything the store hands back: a value written by an older build,
/// a truncated write, or nothing at all.
LeagueSelections decodeLeagueSelections(String? raw) {
  if (raw == null || raw.isEmpty) return const {};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return const {};
    return {
      for (final e in decoded.entries)
        if (e.key is String && e.value is String && (e.value as String).isNotEmpty)
          e.key as String: e.value as String,
    };
  } catch (_) {
    return const {};
  }
}

String encodeLeagueSelections(LeagueSelections map) => jsonEncode(map);
