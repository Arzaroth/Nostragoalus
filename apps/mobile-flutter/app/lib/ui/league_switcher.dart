import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';

/// The menu value standing for the everyone view. PopupMenuButton reads a null
/// result as "dismissed" and never calls onSelected, so the no-league entry
/// cannot carry null as its value.
const everyoneLeagueValue = '';

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
    final leagues = ref.watch(leaguesProvider);
    final selected = ref.watch(selectedLeagueIdProvider);

    return leagues.maybeWhen(
      data: (res) {
        if (res.leagues.isEmpty) return const SizedBox.shrink();
        var current = context.tr('leagues.global');
        for (final l in res.leagues) {
          if (l.id == selected) current = l.name;
        }
        return PopupMenuButton<String>(
          icon: Icon(selected == null ? Icons.groups_outlined : Icons.groups),
          tooltip: '${context.tr('leagues.pillLabel')}: $current',
          onSelected: (id) => selectLeague(ref, id == everyoneLeagueValue ? null : id),
          itemBuilder: (context) => [
            CheckedPopupMenuItem(
              value: everyoneLeagueValue,
              checked: selected == null,
              child: Text(context.tr('leagues.global')),
            ),
            for (final l in res.leagues)
              CheckedPopupMenuItem(
                value: l.id,
                checked: l.id == selected,
                child: Text(l.name, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
