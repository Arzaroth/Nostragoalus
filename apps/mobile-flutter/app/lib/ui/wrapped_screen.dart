import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/section_card.dart';
import 'widgets/stat_tile.dart';

/// Tournament "wrapped" recap. The endpoint is a ready/not-ready union, read
/// raw; when not ready we show a waiting note. When ready it's a scrolling recap
/// of totals, tiers, best/worst calls, jokers, crowd, champion, chat and haul.
class WrappedScreen extends ConsumerWidget {
  const WrappedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wrapped = ref.watch(wrappedProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('wrapped.title')),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            tooltip: context.tr('common.share'),
            onPressed: () => runAction(context, () async {
              final comp = ref.read(selectedCompetitionProvider);
              final img = await ref.read(apiProvider).mintWrappedShare(competition: comp);
              final url = img.startsWith('http') ? img : '${AppConfig.webBase}$img';
              await SharePlus.instance.share(ShareParams(text: url));
            }),
          ),
        ],
      ),
      body: AsyncValueView<Map<String, dynamic>>(
        value: wrapped,
        onRetry: () => ref.invalidate(wrappedProvider),
        data: (w) {
          if (w['ready'] != true) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(context.tr('wrapped.notReady'), textAlign: TextAlign.center),
              ),
            );
          }
          final totals = _map(w['totals']);
          final tiers = _map(w['tiers']);
          final streaks = _map(w['streaks']);
          final jokers = _map(w['jokers']);
          final crowd = _map(w['crowd']);
          final meta = _map(w['meta']);
          final chat = _map(w['chat']);
          final haul = _map(w['haul']);
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Center(
                child: Text(w['competitionName']?.toString() ?? '',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 1.7,
                children: [
                  StatTile(
                      label: context.tr('wrapped.totalsPoints'),
                      value: '${_n(totals['totalPoints']).toInt()}'),
                  if (totals['rank'] != null)
                    StatTile(
                        label: context.tr('wrapped.rank'),
                        value: '#${_n(totals['rank']).toInt()}',
                        sub: totals['topPercent'] != null
                            ? context
                                .tr('wrapped.topPercent')
                                .replaceAll('{pct}', _n(totals['topPercent']).toStringAsFixed(0))
                            : null),
                ],
              ),
              _tiersCard(context, tiers, streaks),
              _pickCard(context, context.tr('wrapped.bestPickLead'), _map(w['bestPick']), Icons.star),
              _missCard(context, _map(w['biggestMiss'])),
              if (_n(jokers['played']) > 0)
                SectionCard(title: context.tr('wrapped.jokerLead'), children: [
                  Text(context.tr('wrapped.jokerPlayed').replaceAll('{n}', '${_n(jokers['played']).toInt()}')),
                  Text('+${_n(jokers['points']).toInt()} ${context.tr('wrapped.pts')}'),
                ]),
              if (_n(crowd['bonusPoints']) > 0 || _n(crowd['loneWolf']) > 0)
                SectionCard(title: context.tr('wrapped.crowdLead'), children: [
                  Text('+${_n(crowd['bonusPoints']).toInt()} ${context.tr('wrapped.crowdBonus')}'),
                  if (_n(crowd['loneWolf']) > 0)
                    Text(context.tr('wrapped.loneWolf').replaceAll('{n}', '${_n(crowd['loneWolf']).toInt()}')),
                ]),
              _metaCard(context, meta),
              if (_n(chat['messages']) > 0)
                SectionCard(title: context.tr('wrapped.chatLead'), children: [
                  Text('${_n(chat['messages']).toInt()} ${context.tr('wrapped.chatMessages')}'),
                  Text(context
                      .tr('wrapped.chatReactions')
                      .replaceAll('{given}', '${_n(chat['reactionsGiven']).toInt()}')
                      .replaceAll('{received}', '${_n(chat['reactionsReceived']).toInt()}')),
                  if (chat['topEmoji'] != null)
                    Text('${context.tr('wrapped.chatTopEmoji')} ${chat['topEmoji']}'),
                ]),
              SectionCard(title: context.tr('wrapped.haulLead'), children: [
                Text(context
                    .tr('wrapped.haulTrophies')
                    .replaceAll('{n}', '${(haul['trophies'] as List?)?.length ?? 0}')),
                Text(context
                    .tr('wrapped.haulBadges')
                    .replaceAll('{n}', '${(haul['badges'] as List?)?.length ?? 0}')),
              ]),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }

  Map<String, dynamic> _map(dynamic v) =>
      v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
  num _n(dynamic v) => (v as num?) ?? 0;

  String _pickLine(Map<String, dynamic> p) {
    final home = p['homeTeam'] ?? '';
    final away = p['awayTeam'] ?? '';
    final pred = '${_n(p['predHome']).toInt()}-${_n(p['predAway']).toInt()}';
    final actual = p['actualHome'] != null
        ? ' (${_n(p['actualHome']).toInt()}-${_n(p['actualAway']).toInt()})'
        : '';
    return '$home $pred$actual $away';
  }

  Widget _tiersCard(BuildContext context, Map<String, dynamic> t, Map<String, dynamic> s) =>
      SectionCard(title: context.tr('wrapped.tiersLead'), children: [
        Text('${context.tr('wrapped.tiersExact')}: ${_n(t['exact']).toInt()}  '
            '${context.tr('wrapped.tiersDiff')}: ${_n(t['diff']).toInt()}  '
            '${context.tr('wrapped.tiersOutcome')}: ${_n(t['outcome']).toInt()}  '
            '${context.tr('wrapped.tiersMiss')}: ${_n(t['miss']).toInt()}'),
        const SizedBox(height: 4),
        Text(context.tr('wrapped.tiersStreak').replaceAll('{n}', '${_n(s['exactStreak']).toInt()}')),
        Text(context
            .tr('wrapped.tiersCompletion')
            .replaceAll('{pct}', _n(t['completionPct']).toStringAsFixed(0))),
      ]);

  Widget _pickCard(BuildContext context, String title, Map<String, dynamic> p, IconData icon) {
    if (p.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: title, children: [
      Row(children: [
        Icon(icon, size: 18, color: Colors.amber),
        const SizedBox(width: 6),
        Expanded(child: Text(_pickLine(p))),
      ]),
      Text('+${_n(p['totalPoints']).toInt()} ${context.tr('wrapped.pts')}'),
    ]);
  }

  Widget _missCard(BuildContext context, Map<String, dynamic> p) {
    if (p.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: context.tr('wrapped.missLead'), children: [
      Text(_pickLine(p)),
      if (p['fieldExactPct'] != null)
        Text('${_n(p['fieldExactPct']).toStringAsFixed(0)}% ${context.tr('wrapped.missField')}',
            style: Theme.of(context).textTheme.bodySmall),
    ]);
  }

  Widget _metaCard(BuildContext context, Map<String, dynamic> meta) {
    final champ = _map(meta['champion']);
    final scorer = _map(meta['bestScorer']);
    if (champ.isEmpty && scorer.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: context.tr('wrapped.metaLead'), children: [
      if (champ.isNotEmpty)
        Text(champ['hit'] == true
            ? context
                .tr('wrapped.metaChampionHit')
                .replaceAll('{points}', '${_n(champ['points']).toInt()}')
            : context.tr('wrapped.metaChampionMiss')),
      if (scorer.isNotEmpty)
        Text(scorer['hit'] == true
            ? context
                .tr('wrapped.metaScorerHit')
                .replaceAll('{points}', '${_n(scorer['points']).toInt()}')
            : context.tr('wrapped.metaScorerMiss')),
    ]);
  }
}
