import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';
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
            icon: const Icon(Icons.share_outlined),
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
            return EmptyState(icon: Icons.hourglass_empty, message: context.tr('wrapped.notReady'));
          }
          final theme = Theme.of(context);
          final t = context.tokens;
          final totals = _map(w['totals']);
          final tiers = _map(w['tiers']);
          final streaks = _map(w['streaks']);
          final jokers = _map(w['jokers']);
          final crowd = _map(w['crowd']);
          final meta = _map(w['meta']);
          final chat = _map(w['chat']);
          final haul = _map(w['haul']);
          return ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                child: Text(w['competitionName']?.toString() ?? '',
                    textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
              ),
              StatBand(children: [
                StatTile(
                    label: context.tr('wrapped.totalsPoints'),
                    value: '${_n(totals['totalPoints']).toInt()}'),
                if (totals['rank'] != null)
                  StatTile(
                      label: context.tr('wrapped.rank'),
                      value: '#${_n(totals['rank']).toInt()}',
                      color: _n(totals['rank']) == 1 ? t.gold : null,
                      sub: totals['topPercent'] != null
                          ? context
                              .tr('wrapped.topPercent')
                              .replaceAll('{pct}', _n(totals['topPercent']).toStringAsFixed(0))
                          : null),
              ]),
              _tiersCard(context, tiers, streaks),
              _pickCard(context, context.tr('wrapped.bestPickLead'), _map(w['bestPick']), Icons.star),
              _missCard(context, _map(w['biggestMiss'])),
              if (_n(jokers['played']) > 0)
                SectionCard(title: context.tr('wrapped.jokerLead'), padded: true, children: [
                  Text(context.tr('wrapped.jokerPlayed').replaceAll('{n}', '${_n(jokers['played']).toInt()}')),
                  const SizedBox(height: 6),
                  _points(context, _n(jokers['points']).toInt(), context.tr('wrapped.pts')),
                ]),
              if (_n(crowd['bonusPoints']) > 0 || _n(crowd['loneWolf']) > 0)
                SectionCard(title: context.tr('wrapped.crowdLead'), padded: true, children: [
                  _points(context, _n(crowd['bonusPoints']).toInt(), context.tr('wrapped.crowdBonus')),
                  if (_n(crowd['loneWolf']) > 0) ...[
                    const SizedBox(height: 6),
                    Text(context.tr('wrapped.loneWolf').replaceAll('{n}', '${_n(crowd['loneWolf']).toInt()}')),
                  ],
                ]),
              _metaCard(context, meta),
              if (_n(chat['messages']) > 0)
                SectionCard(title: context.tr('wrapped.chatLead'), padded: true, children: [
                  _points(context, _n(chat['messages']).toInt(), context.tr('wrapped.chatMessages'),
                      signed: false),
                  const SizedBox(height: 6),
                  Text(context
                      .tr('wrapped.chatReactions')
                      .replaceAll('{given}', '${_n(chat['reactionsGiven']).toInt()}')
                      .replaceAll('{received}', '${_n(chat['reactionsReceived']).toInt()}')),
                  if (chat['topEmoji'] != null)
                    Text('${context.tr('wrapped.chatTopEmoji')} ${chat['topEmoji']}'),
                ]),
              SectionCard(title: context.tr('wrapped.haulLead'), padded: true, children: [
                Text(context
                    .tr('wrapped.haulTrophies')
                    .replaceAll('{n}', '${(haul['trophies'] as List?)?.length ?? 0}')),
                Text(context
                    .tr('wrapped.haulBadges')
                    .replaceAll('{n}', '${(haul['badges'] as List?)?.length ?? 0}')),
              ]),
            ],
          );
        },
      ),
    );
  }

  Map<String, dynamic> _map(dynamic v) =>
      v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
  num _n(dynamic v) => (v as num?) ?? 0;

  /// A scoreboard number with its unit word beside it ("+12 pts").
  Widget _points(BuildContext context, int n, String unit, {bool signed = true}) {
    final t = context.tokens;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(signed ? '+$n' : '$n', style: t.score(24, color: signed ? t.emerald : null)),
        const SizedBox(width: 6),
        Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: Text(unit, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: t.muted)),
        ),
      ],
    );
  }

  Widget _pickLine(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final pred = '${_n(p['predHome']).toInt()} - ${_n(p['predAway']).toInt()}';
    final actual = p['actualHome'] != null
        ? '${_n(p['actualHome']).toInt()} - ${_n(p['actualAway']).toInt()}'
        : null;
    return Row(
      children: [
        Expanded(
          child: Text('${p['homeTeam'] ?? ''}',
              textAlign: TextAlign.end,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(pred, style: t.score(24)),
              if (actual != null)
                Text(actual, style: t.score(14, weight: FontWeight.w500, color: t.muted)),
            ],
          ),
        ),
        Expanded(
          child: Text('${p['awayTeam'] ?? ''}',
              maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
        ),
      ],
    );
  }

  Widget _tiersCard(BuildContext context, Map<String, dynamic> t, Map<String, dynamic> s) {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(title: context.tr('wrapped.tiersLead')),
        StatBand(children: [
          StatTile(
              label: context.tr('wrapped.tiersExact'),
              value: '${_n(t['exact']).toInt()}',
              color: tokens.emerald),
          StatTile(label: context.tr('wrapped.tiersDiff'), value: '${_n(t['diff']).toInt()}'),
          StatTile(label: context.tr('wrapped.tiersOutcome'), value: '${_n(t['outcome']).toInt()}'),
          StatTile(
              label: context.tr('wrapped.tiersMiss'),
              value: '${_n(t['miss']).toInt()}',
              color: tokens.muted),
        ]),
        const SizedBox(height: 8),
        Panel(
          padding: const EdgeInsets.all(16),
          children: [
            Text(context.tr('wrapped.tiersStreak').replaceAll('{n}', '${_n(s['exactStreak']).toInt()}')),
            const SizedBox(height: 2),
            Text(
                context
                    .tr('wrapped.tiersCompletion')
                    .replaceAll('{pct}', _n(t['completionPct']).toStringAsFixed(0)),
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ],
    );
  }

  Widget _pickCard(BuildContext context, String title, Map<String, dynamic> p, IconData icon) {
    if (p.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: title, padded: true, children: [
      _pickLine(context, p),
      const SizedBox(height: 10),
      Row(
        children: [
          Icon(icon, size: 18, color: context.tokens.amber),
          const SizedBox(width: 8),
          _points(context, _n(p['totalPoints']).toInt(), context.tr('wrapped.pts')),
        ],
      ),
    ]);
  }

  Widget _missCard(BuildContext context, Map<String, dynamic> p) {
    if (p.isEmpty) return const SizedBox.shrink();
    final t = context.tokens;
    return SectionCard(title: context.tr('wrapped.missLead'), padded: true, children: [
      _pickLine(context, p),
      if (p['fieldExactPct'] != null) ...[
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('${_n(p['fieldExactPct']).toStringAsFixed(0)}%', style: t.score(24, color: t.live)),
            const SizedBox(width: 6),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(context.tr('wrapped.missField'),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(color: t.muted)),
              ),
            ),
          ],
        ),
      ],
    ]);
  }

  Widget _metaCard(BuildContext context, Map<String, dynamic> meta) {
    final champ = _map(meta['champion']);
    final scorer = _map(meta['bestScorer']);
    if (champ.isEmpty && scorer.isEmpty) return const SizedBox.shrink();
    final t = context.tokens;
    Widget line(IconData icon, bool hit, String text) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: hit ? t.emerald : t.faint),
            const SizedBox(width: 8),
            Expanded(child: Text(text)),
          ],
        );
    return SectionCard(title: context.tr('wrapped.metaLead'), padded: true, children: [
      if (champ.isNotEmpty)
        line(
            Icons.emoji_events_outlined,
            champ['hit'] == true,
            champ['hit'] == true
                ? context
                    .tr('wrapped.metaChampionHit')
                    .replaceAll('{points}', '${_n(champ['points']).toInt()}')
                : context.tr('wrapped.metaChampionMiss')),
      if (champ.isNotEmpty && scorer.isNotEmpty) const SizedBox(height: 6),
      if (scorer.isNotEmpty)
        line(
            Icons.sports_soccer_outlined,
            scorer['hit'] == true,
            scorer['hit'] == true
                ? context
                    .tr('wrapped.metaScorerHit')
                    .replaceAll('{points}', '${_n(scorer['points']).toInt()}')
                : context.tr('wrapped.metaScorerMiss')),
    ]);
  }
}
