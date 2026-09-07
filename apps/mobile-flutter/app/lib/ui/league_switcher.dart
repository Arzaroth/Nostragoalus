import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/app_bar_picker.dart';

/// The menu value standing for the everyone view. PopupMenuButton reads a null
/// result as "dismissed" and never calls onSelected, so the no-league entry
/// cannot carry null as its value.
const _everyone = '';

/// App-bar league lens: "Everyone", then each league in the selected
/// competition. The choice narrows the leaderboard and the crowd consensus to
/// that league's members, and is remembered per competition. The mobile
/// counterpart of the web's `LeaguePill.vue`.
///
/// Hidden while the user is in no league here - a menu whose only entry is the
/// view already on screen is noise.
class LeagueSwitcher extends ConsumerWidget {
  const LeagueSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // valueOrNull, not maybeWhen(data:): riverpod keeps the previous list
    // alongside a reload or an error, and dropping the control on either would
    // strand the user with a lensed board and no way to widen it.
    final leagues = ref.watch(leaguesProvider).valueOrNull?.leagues;
    if (leagues == null || leagues.isEmpty) return const SizedBox.shrink();
    final selected = ref.watch(selectedLeagueIdProvider);

    var current = context.tr('leagues.global');
    LeaguesResponseLeague? picked;
    for (final l in leagues) {
      if (l.id == selected) {
        current = l.name;
        picked = l;
      }
    }
    return AppBarPicker<String>(
      icon: picked == null ? Icons.groups_outlined : Icons.groups,
      label: '${context.tr('leagues.pillLabel')}: $current',
      selected: selected ?? _everyone,
      onSelected: (id) {
        if (id == _everyone) {
          selectLeague(ref, null);
          return;
        }
        for (final l in leagues) {
          if (l.id == id) selectLeague(ref, id, competition: l.competition.slug);
        }
      },
      options: [
        PickerOption(value: _everyone, label: context.tr('leagues.global')),
        for (final l in leagues) PickerOption(value: l.id, label: l.name),
      ],
    );
  }
}
