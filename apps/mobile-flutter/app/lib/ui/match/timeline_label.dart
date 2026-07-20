/// Pure port of the play-by-play labelling in
/// `apps/web-nuxt/app/utils/match-view.ts` (`pbpTextSpec`, `TIMELINE_ICONS`)
/// plus `formatPlayerName` from `app/utils/format.ts`. Kept free of Flutter so
/// it is unit-testable; it belongs in `apps/mobile-flutter/parity/lib` with
/// golden vectors once that package accepts new modules.
library;

/// A localizable spec instead of a rendered string: the caller resolves
/// [key] + [params] through `tr`, or renders [literal] as-is (VAR decision text
/// arrives pre-localized from the feed). [key] is empty when there is nothing
/// to show.
class PbpSpec {
  const PbpSpec(this.key, {this.params, this.literal});

  final String key;
  final Map<String, Object?>? params;
  final String? literal;
}

/// Emoji per event kind. `foul` has no entry (the web renders a whistle icon;
/// no whistle emoji exists).
const timelineIcons = <String, String>{
  'goal': '⚽',
  'own-goal': '⚽',
  'penalty-goal': '⚽',
  'penalty-missed': '❌',
  'penalty-awarded': '🎯',
  'assist': '👟',
  'yellow': '🟨',
  'red': '🟥',
  'second-yellow': '🟥',
  'sub': '🔄',
  'shot': '🥅',
  'var': '📺',
  'period': '⏱️',
};

const _goalKinds = {'goal', 'own-goal', 'penalty-goal'};

bool isGoalKind(String kind) => _goalKinds.contains(kind);

const _kindLabelKeys = <String, String>{
  'goal': 'goal',
  'own-goal': 'ownGoal',
  'penalty-goal': 'penaltyGoal',
  'penalty-missed': 'penaltyMissed',
  'penalty-awarded': 'penaltyAwarded',
  'assist': 'assist',
  'yellow': 'yellow',
  'red': 'red',
  'second-yellow': 'secondYellow',
  'sub': 'sub',
  'shot': 'shot',
  'foul': 'foul',
  'corner': 'corner',
  'var': 'var',
  'period': 'period',
};

const _pbpPlayerKeys = <String, String>{
  'goal': 'goal',
  'own-goal': 'ownGoal',
  'penalty-goal': 'penaltyGoal',
  'penalty-missed': 'penaltyMissed',
  'assist': 'assist',
  'yellow': 'yellow',
  'red': 'red',
  'second-yellow': 'secondYellow',
  'shot': 'shot',
  'foul': 'foul',
  'corner': 'corner',
};

const _periodKeys = <String, String>{
  'kickoff': 'kickoff',
  'half-time': 'halfTime',
  'second-half': 'secondHalf',
  'second-half-end': 'secondHalfEnd',
  'extra-time': 'extraTime',
  'extra-time-end': 'extraTimeEnd',
  'full-time': 'fullTime',
};

PbpSpec pbpTextSpec({
  required String kind,
  String? playerName,
  String? playerInName,
  String? playerOutName,
  String? periodKind,
  String? text,
}) {
  if (kind == 'period') {
    final key = periodKind == null ? null : _periodKeys[periodKind];
    return PbpSpec(key == null ? '' : 'match.pbp.period.$key');
  }
  if (kind == 'var') {
    return text != null && text.isNotEmpty
        ? PbpSpec('', literal: text)
        : const PbpSpec('match.pbpKind.var');
  }
  if (kind == 'sub') {
    if (playerInName != null && playerOutName != null) {
      return PbpSpec('match.pbp.sub', params: {
        'playerIn': formatPlayerName(playerInName),
        'playerOut': formatPlayerName(playerOutName),
      });
    }
    return const PbpSpec('match.pbpKind.sub');
  }
  final tmpl = _pbpPlayerKeys[kind];
  if (tmpl != null && playerName != null && playerName.isNotEmpty) {
    return PbpSpec('match.pbp.$tmpl', params: {'player': formatPlayerName(playerName)});
  }
  final fallback = _kindLabelKeys[kind];
  return PbpSpec(fallback == null ? '' : 'match.pbpKind.$fallback');
}

final _twoUppers = RegExp(r'\p{Lu}{2}', unicode: true);
final _namePart = RegExp("[^-']+");

/// SHOUTED provider names ("VAN DIJK") title-cased, everything else untouched.
String formatPlayerName(String? name) {
  if (name == null || name.isEmpty) return '';
  return name
      .split(' ')
      .map((word) => word == word.toUpperCase() && _twoUppers.hasMatch(word)
          ? word.replaceAllMapped(
              _namePart, (m) => m[0]![0] + m[0]!.substring(1).toLowerCase())
          : word)
      .join(' ');
}
