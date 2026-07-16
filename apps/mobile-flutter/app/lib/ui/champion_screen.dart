import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// The tournament winner pick. Points scale with the team's FIFA-rank tier at
/// pick time; picking is disabled once the competition locks.
class ChampionScreen extends ConsumerWidget {
  const ChampionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final champion = ref.watch(championProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.champion'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(championProvider.future),
        child: AsyncValueView<ChampionResponse>(
          value: champion,
          onRetry: () => ref.invalidate(championProvider),
          data: (res) {
            final pickedCode = res.myPick?.teamCode;
            return ListView(
              children: [
                if (res.myPick != null)
                  Card(
                    margin: const EdgeInsets.all(12),
                    color: Theme.of(context).colorScheme.primaryContainer,
                    child: ListTile(
                      leading: const Icon(Icons.emoji_events),
                      title: Text(res.myPick!.teamName),
                      subtitle: Text(context.tr('champion.potential',
                          {'n': res.myPick!.potentialPoints})),
                    ),
                  ),
                for (final t in res.teams)
                  ListTile(
                    leading: CircleAvatar(child: Text(t.code)),
                    title: Text(t.name),
                    subtitle: t.fifaRank != null
                        ? Text(context.tr('champion.rank', {'n': t.fifaRank!.toInt()}))
                        : null,
                    trailing: pickedCode == t.code
                        ? const Icon(Icons.check_circle, color: Colors.green)
                        : Text('+${t.potentialPoints.toInt()}'),
                    onTap: res.locked
                        ? null
                        : () async {
                            await ref.read(apiProvider).setChampion(t.code, t.name);
                            ref.invalidate(championProvider);
                          },
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
