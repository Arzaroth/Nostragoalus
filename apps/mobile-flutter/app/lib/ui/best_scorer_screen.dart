import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';
import 'widgets/team_flag.dart';

/// The Golden Boot pick + the tournament's top scorers. Interactive: pick a team,
/// then a player from its squad (/api/teams/[code].squad), saved via
/// PUT /api/best-scorer. Locked once the first match kicks off.
class BestScorerScreen extends ConsumerStatefulWidget {
  const BestScorerScreen({super.key});
  @override
  ConsumerState<BestScorerScreen> createState() => _BestScorerScreenState();
}

class _BestScorerScreenState extends ConsumerState<BestScorerScreen> {
  String? _teamCode;
  String? _teamName;
  bool _saving = false;

  Future<void> _pick(Squad player) async {
    setState(() => _saving = true);
    await runAction(context, () async {
      await ref.read(apiProvider).setBestScorer(
            playerId: player.playerId,
            playerName: player.name,
            teamCode: _teamCode,
            teamName: _teamName ?? '',
            competition: ref.read(selectedCompetitionProvider),
          );
      ref.invalidate(bestScorerProvider);
    }, successKey: 'bestScorer.saved');
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final best = ref.watch(bestScorerProvider);
    final scorers = ref.watch(scorersProvider);
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('bestScorer.title'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(bestScorerProvider);
          ref.invalidate(scorersProvider);
          await ref.read(bestScorerProvider.future);
          await ref.read(scorersProvider.future);
        },
        child: AsyncValueView<BestScorerResponse>(
          value: best,
          onRetry: () => ref.invalidate(bestScorerProvider),
          data: (bs) => ListView(
            padding: const EdgeInsets.only(top: 4, bottom: 24),
            children: [
              if (bs.myPick != null)
                Panel(
                  tint: scheme.primary.withValues(alpha: 0.08),
                  children: [
                    PanelRow(
                      leading: TeamFlag(bs.myPick!.teamCode, height: 24),
                      title: Text(bs.myPick!.playerName),
                      subtitle: Text(bs.myPick!.teamName),
                      trailing: Text('${bs.myPick!.awardedPoints}', style: t.score(24)),
                    ),
                  ],
                ),
              if (!bs.locked) ..._picker(context, bs) else _lockedNote(context),
              PanelHeading(title: context.tr('bestScorer.topScorers')),
              scorers.maybeWhen(
                data: (sc) => Panel(children: [
                  for (final s in sc.scorers.take(20))
                    PanelRow(
                      leading: SizedBox(
                        width: 32,
                        child: Text('${s.goals.toInt()}',
                            textAlign: TextAlign.center, style: t.score(22)),
                      ),
                      title: Row(
                        children: [
                          TeamFlag(s.teamCode, height: 16),
                          const SizedBox(width: 8),
                          Flexible(
                              child:
                                  Text(s.playerName, maxLines: 1, overflow: TextOverflow.ellipsis)),
                        ],
                      ),
                      subtitle: Text(s.teamName),
                    ),
                ]),
                orElse: () => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lockedNote(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
        child: Row(
          children: [
            Icon(Icons.lock_outline, size: 16, color: context.tokens.faint),
            const SizedBox(width: 8),
            Expanded(
              child: Text(context.tr('bestScorer.lockedIn'),
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          ],
        ),
      );

  List<Widget> _picker(BuildContext context, BestScorerResponse bs) {
    final t = context.tokens;
    return [
      PanelHeading(
        title: context.tr('bestScorer.pickPlayer'),
        trailing: '+${bs.bonus.toInt()}',
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: DropdownButtonFormField<String>(
          initialValue: _teamCode,
          isExpanded: true,
          decoration: InputDecoration(labelText: context.tr('bestScorer.pickTeam')),
          items: [
            for (final team in bs.teams) DropdownMenuItem(value: team.code, child: Text(team.name)),
          ],
          onChanged: (code) => setState(() {
            _teamCode = code;
            _teamName = bs.teams.firstWhere((team) => team.code == code).name;
          }),
        ),
      ),
      if (_teamCode != null) ...[
        const SizedBox(height: 12),
        AsyncValueView<List<dynamic>>(
          value: ref.watch(squadProvider(_teamCode!)),
          onRetry: () => ref.invalidate(squadProvider(_teamCode!)),
          data: (squad) => Panel(children: [
            // A squad entry with no id cannot be persisted as a pick.
            for (final p in squad.whereType<Squad>())
              if (p.playerId.isNotEmpty)
                PanelRow(
                  selected: bs.myPick?.playerId == p.playerId,
                  leading: Icon(
                      bs.myPick?.playerId == p.playerId ? Icons.check_circle : Icons.person_outline,
                      color: bs.myPick?.playerId == p.playerId ? t.emerald : null),
                  title: Text(p.name),
                  subtitle: p.position != null ? Text(p.position!.wire) : null,
                  trailing: p.shirtNumber != null
                      ? Text('${p.shirtNumber!.toInt()}',
                          style: t.score(17, weight: FontWeight.w500, color: t.muted))
                      : null,
                  onTap: _saving ? null : () => _pick(p),
                ),
          ]),
        ),
      ],
    ];
  }
}
