import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';
import 'widgets/team_flag.dart';

/// The tournament winner pick. Points scale with the team's FIFA-rank tier at
/// pick time; picking is disabled once the competition locks.
class ChampionScreen extends ConsumerWidget {
  const ChampionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final champion = ref.watch(championProvider);
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
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
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              children: [
                if (res.myPick != null) ...[
                  Panel(
                    tint: scheme.primary.withValues(alpha: 0.08),
                    children: [
                      PanelRow(
                        leading: TeamFlag(res.myPick!.teamCode, height: 24),
                        title: Text(res.myPick!.teamName),
                        subtitle: Text(
                            context.tr('champion.potential', {'n': res.myPick!.potentialPoints})),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.emoji_events, color: t.amber),
                            if (res.locked) ...[
                              const SizedBox(width: 8),
                              Tag(context.tr('picks.locked'), icon: Icons.lock),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                Panel(children: [
                  for (final team in res.teams)
                    PanelRow(
                      selected: pickedCode == team.code,
                      leading: TeamFlag(team.code, height: 20),
                      title: Text(team.name),
                      subtitle: team.fifaRank != null
                          ? Text(context.tr('champion.rank', {'n': team.fifaRank!.toInt()}))
                          : null,
                      trailing: pickedCode == team.code
                          ? Icon(Icons.check_circle, color: t.emerald)
                          : Text('+${team.potentialPoints.toInt()}',
                              style: t.score(20, color: res.locked ? t.faint : scheme.onSurface)),
                      onTap: res.locked
                          ? null
                          : () async {
                              await ref.read(apiProvider).setChampion(team.code, team.name);
                              ref.invalidate(championProvider);
                            },
                    ),
                ]),
              ],
            );
          },
        ),
      ),
    );
  }
}
