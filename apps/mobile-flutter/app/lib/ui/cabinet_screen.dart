import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../api/models.gen.dart';
import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';

/// A user's public trophy cabinet: trophies + earned achievements.
class CabinetScreen extends ConsumerWidget {
  const CabinetScreen({super.key, required this.userId, required this.name});
  final String userId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cabinet = ref.watch(cabinetProvider(userId));
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      floatingActionButton: cabinet.valueOrNull?.isOwner == true
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.share_outlined),
              label: Text(context.tr('common.share')),
              onPressed: () => runAction(context, () async {
                final comp = ref.read(selectedCompetitionProvider);
                final token = await ref.read(apiProvider).mintProfileShare(competition: comp);
                await SharePlus.instance.share(ShareParams(text: '${AppConfig.webBase}/p/$token'));
              }),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(cabinetProvider(userId).future),
        child: AsyncValueView<CabinetResponse>(
          value: cabinet,
          onRetry: () => ref.invalidate(cabinetProvider(userId)),
          data: (c) {
            final earned = c.achievements.where((a) => a.earned != null).toList();
            // The owner sees locked achievements with their progress.
            final locked = c.isOwner
                ? c.achievements.where((a) => a.earned == null && !a.hidden).toList()
                : const <Achievement>[];
            return ListView(
              padding: const EdgeInsets.only(bottom: 96),
              children: [
                const SizedBox(height: 16),
                Center(
                  child: CircleAvatar(
                    radius: 32,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Text(c.displayName.characters.first.toUpperCase(),
                        style: TextStyle(
                            fontFamily: AppTheme.displayFamily,
                            fontSize: 30,
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.onPrimaryContainer)),
                  ),
                ),
                const SizedBox(height: 10),
                Center(child: Text(c.displayName, style: theme.textTheme.headlineSmall)),
                _showcaseSection(context, ref, c, earned),
                if (c.trophies.isNotEmpty) ...[
                  PanelHeading(title: context.tr('achievements.trophiesHeading')),
                  Panel(children: [
                    for (final tr in c.trophies)
                      PanelRow(
                        leading: Icon(Icons.emoji_events, color: t.gold),
                        title: Text(_trophyName(context, tr)),
                        subtitle: Text(context.tr('achievements.trophy.${tr.type}.desc')),
                        trailing: tr.value > 0 ? Text('${tr.value.toInt()}', style: t.score(22)) : null,
                      ),
                  ]),
                ],
                PanelHeading(
                    title: context.tr('achievements.badgesHeading'), trailing: '${earned.length}'),
                Panel(children: [
                  if (earned.isEmpty && locked.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(
                        child: Text(context.tr('achievements.empty'),
                            style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                      ),
                    ),
                  for (final a in earned) _earnedTile(context, a),
                  for (final a in locked) _lockedTile(context, a),
                ]),
              ],
            );
          },
        ),
      ),
    );
  }

  String _trophyName(BuildContext context, Trophy t) => t.type == 'TEAM_SPECIALIST' && t.teamCode != null
      ? context.tr('achievements.trophy.TEAM_SPECIALIST.name').replaceAll('{team}', t.teamCode!)
      : context.tr('achievements.trophy.${t.type}.name');

  Widget _earnedTile(BuildContext context, Achievement a) {
    final tier = a.earned?.tier;
    final rarity = _rarityFor(a, tier);
    final color = _tierColor(context, tier);
    return PanelRow(
      leading: Icon(Icons.military_tech, color: color ?? context.tokens.amber),
      title: Text(context.tr('achievements.badge.${a.key}.name')),
      subtitle: Text(context.tr('achievements.badge.${a.key}.desc')),
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (tier != null) Tag(context.tr('achievements.tier.$tier'), color: color),
          if (rarity != null) ...[
            const SizedBox(height: 4),
            Text(context.tr('achievements.rarity').replaceAll('{pct}', _fmtPct(rarity.pct)),
                style: Theme.of(context).textTheme.labelSmall),
          ],
        ],
      ),
    );
  }

  Widget _lockedTile(BuildContext context, Achievement a) {
    final t = context.tokens;
    final current = a.current ?? 0;
    final next = a.tiers
        .where((t) => t.threshold > current)
        .fold<double?>(null, (m, t) => m == null || t.threshold < m ? t.threshold : m);
    final frac = next == null || next <= 0 ? null : (current / next).clamp(0.0, 1.0);
    return PanelRow(
      leading: Icon(Icons.lock_outline, color: t.faint),
      title: Text(context.tr('achievements.badge.${a.key}.name'),
          style: TextStyle(color: t.muted)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.tr('achievements.badge.${a.key}.criteria')),
          if (frac != null) ...[
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(value: frac, minHeight: 4),
            ),
            const SizedBox(height: 4),
            Text('${current.toInt()} / ${next!.toInt()}',
                style: t.score(14, weight: FontWeight.w600, color: t.muted)),
          ],
        ],
      ),
    );
  }

  Rarity? _rarityFor(Achievement a, String? tier) {
    if (a.rarity.isEmpty) return null;
    if (tier != null) {
      for (final r in a.rarity) {
        if (r.tier == tier) return r;
      }
    }
    return a.rarity.first;
  }

  String _fmtPct(double pct) => pct >= 10 ? pct.toStringAsFixed(0) : pct.toStringAsFixed(1);

  Color? _tierColor(BuildContext context, String? tier) {
    final t = context.tokens;
    return switch (tier) {
      'BRONZE' => t.bronze,
      'SILVER' => t.silver,
      'GOLD' => t.gold,
      'DIAMOND' => Theme.of(context).colorScheme.primary,
      _ => null,
    };
  }

  Widget _showcaseSection(
      BuildContext context, WidgetRef ref, CabinetResponse c, List<Achievement> earned) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final pinnedKeys = (c.showcase.toList()..sort((a, b) => a.slot.compareTo(b.slot)))
        .map((s) => s.achievementKey)
        .toList();
    if (pinnedKeys.isEmpty && !c.isOwner) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(
          title: context.tr('achievements.showcaseHeading'),
          action: c.isOwner
              ? TextButton.icon(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(context.tr('common.edit')),
                  onPressed: () => _editShowcase(context, ref, c, earned, pinnedKeys),
                )
              : null,
        ),
        Panel(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
          dividers: false,
          children: [
            if (pinnedKeys.isEmpty)
              Text(context.tr('achievements.showcaseEmpty'),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: t.muted))
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final k in pinnedKeys)
                    Expanded(
                      child: Column(
                        children: [
                          Icon(Icons.military_tech, size: 32, color: t.amber),
                          Padding(
                            padding: const EdgeInsets.all(4),
                            child: Text(context.tr('achievements.badge.$k.name'),
                                textAlign: TextAlign.center,
                                style: theme.textTheme.labelMedium),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _editShowcase(BuildContext context, WidgetRef ref, CabinetResponse c,
      List<Achievement> earned, List<String> pinned) async {
    final selected = <String>[...pinned];
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          builder: (context, controller) => ListView(
            controller: controller,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                child: Text(context.tr('achievements.showcaseEditHint'),
                    style: Theme.of(context).textTheme.headlineSmall),
              ),
              for (final a in earned)
                CheckboxListTile(
                  dense: true,
                  value: selected.contains(a.key),
                  title: Text(context.tr('achievements.badge.${a.key}.name')),
                  onChanged: (v) {
                    setModalState(() {
                      if (v == true) {
                        if (selected.length < 3 && !selected.contains(a.key)) selected.add(a.key);
                      } else {
                        selected.remove(a.key);
                      }
                    });
                  },
                ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: Text(context.tr('common.save')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (saved != true || !context.mounted) return;
    await runAction(context, () async {
      await ref.read(apiProvider).setShowcase(selected,
          competition: ref.read(selectedCompetitionProvider));
      ref.invalidate(cabinetProvider(c.userId));
    }, successKey: 'common.saved');
  }
}
