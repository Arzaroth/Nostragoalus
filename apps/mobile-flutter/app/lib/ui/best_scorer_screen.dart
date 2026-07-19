import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

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

  Future<void> _pick(Map<String, dynamic> player) async {
    setState(() => _saving = true);
    try {
      await ref.read(apiProvider).setBestScorer(
            playerId: player['playerId'].toString(),
            playerName: player['name'].toString(),
            teamCode: _teamCode,
            teamName: _teamName ?? '',
            competition: ref.read(selectedCompetitionProvider),
          );
      ref.invalidate(bestScorerProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('bestScorer.saved'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('err.generic'))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final best = ref.watch(bestScorerProvider);
    final scorers = ref.watch(scorersProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('bestScorer.title'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(bestScorerProvider);
          ref.invalidate(scorersProvider);
        },
        child: AsyncValueView<BestScorerResponse>(
          value: best,
          onRetry: () => ref.invalidate(bestScorerProvider),
          data: (bs) => ListView(
            children: [
              if (bs.myPick != null)
                Card(
                  margin: const EdgeInsets.all(12),
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: ListTile(
                    leading: const Icon(Icons.sports_soccer),
                    title: Text(bs.myPick!.playerName),
                    subtitle: Text(bs.myPick!.teamName),
                    trailing: Text('${bs.myPick!.awardedPoints}'),
                  ),
                ),
              if (!bs.locked) ..._picker(context, bs) else _lockedNote(context),
              const Divider(),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(context.tr('bestScorer.topScorers'),
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              scorers.maybeWhen(
                data: (sc) => Column(
                  children: [
                    for (final s in sc.scorers.take(20))
                      ListTile(
                        dense: true,
                        leading: Text('${s.goals.toInt()}',
                            style: Theme.of(context).textTheme.titleMedium),
                        title: Text(s.playerName),
                        subtitle: Text(s.teamName),
                      ),
                  ],
                ),
                orElse: () => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lockedNote(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Text(context.tr('bestScorer.lockedIn'),
            style: Theme.of(context).textTheme.bodySmall),
      );

  List<Widget> _picker(BuildContext context, BestScorerResponse bs) {
    return [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text('${context.tr('bestScorer.pickPlayer')} · +${bs.bonus.toInt()}',
            style: Theme.of(context).textTheme.titleMedium),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: DropdownButtonFormField<String>(
          initialValue: _teamCode,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: context.tr('bestScorer.pickTeam'),
            border: const OutlineInputBorder(),
          ),
          items: [
            for (final t in bs.teams) DropdownMenuItem(value: t.code, child: Text(t.name)),
          ],
          onChanged: (code) => setState(() {
            _teamCode = code;
            _teamName = bs.teams.firstWhere((t) => t.code == code).name;
          }),
        ),
      ),
      if (_teamCode != null)
        AsyncValueView<List<dynamic>>(
          value: ref.watch(squadProvider(_teamCode!)),
          onRetry: () => ref.invalidate(squadProvider(_teamCode!)),
          data: (squad) => Column(
            children: [
              for (final raw in squad.cast<Map>())
                Builder(builder: (context) {
                  final p = raw.cast<String, dynamic>();
                  final isPick = bs.myPick?.playerId == p['playerId']?.toString();
                  return ListTile(
                    dense: true,
                    leading: Icon(isPick ? Icons.check_circle : Icons.person,
                        color: isPick ? Colors.green : null),
                    title: Text((p['name'] ?? '').toString()),
                    subtitle: p['position'] != null ? Text(p['position'].toString()) : null,
                    onTap: _saving ? null : () => _pick(p),
                  );
                }),
            ],
          ),
        ),
    ];
  }
}
