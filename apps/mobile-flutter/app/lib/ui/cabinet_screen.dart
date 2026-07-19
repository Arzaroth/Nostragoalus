import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// A user's public trophy cabinet: trophies + earned achievements.
class CabinetScreen extends ConsumerWidget {
  const CabinetScreen({super.key, required this.userId, required this.name});
  final String userId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cabinet = ref.watch(cabinetProvider(userId));
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(cabinetProvider(userId).future),
        child: AsyncValueView<CabinetResponse>(
          value: cabinet,
          onRetry: () => ref.invalidate(cabinetProvider(userId)),
          data: (c) {
            final earned = c.achievements.where((a) => a.earned != null).toList();
            return ListView(
              children: [
                const SizedBox(height: 12),
                Center(
                  child: CircleAvatar(
                    radius: 32,
                    child: Text(c.displayName.characters.first.toUpperCase(),
                        style: const TextStyle(fontSize: 26)),
                  ),
                ),
                const SizedBox(height: 8),
                Center(
                    child: Text(c.displayName,
                        style: Theme.of(context).textTheme.titleLarge)),
                const SizedBox(height: 16),
                _showcaseSection(context, ref, c, earned),
                if (c.trophies.isNotEmpty) ...[
                  _header(context, context.tr('achievements.trophiesHeading')),
                  for (final t in c.trophies)
                    ListTile(
                      leading: const Icon(Icons.emoji_events, color: Colors.amber),
                      title: Text(_trophyName(context, t)),
                      subtitle: Text(context.tr('achievements.trophy.${t.type}.desc')),
                      trailing: t.value > 0 ? Text('${t.value.toInt()}') : null,
                    ),
                ],
                _header(context,
                    '${context.tr('achievements.badgesHeading')} (${earned.length})'),
                if (earned.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(child: Text(context.tr('achievements.empty'))),
                  ),
                for (final a in earned) _earnedTile(context, a),
                // The owner sees locked achievements with their progress.
                if (c.isOwner) ...[
                  for (final a in c.achievements.where((a) => a.earned == null && !a.hidden))
                    _lockedTile(context, a),
                ],
                const SizedBox(height: 24),
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
    return ListTile(
      leading: Icon(Icons.military_tech, color: _tierColor(tier)),
      title: Text(context.tr('achievements.badge.${a.key}.name')),
      subtitle: Text(context.tr('achievements.badge.${a.key}.desc')),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (tier != null)
            Text(context.tr('achievements.tier.$tier'),
                style: TextStyle(color: _tierColor(tier), fontWeight: FontWeight.bold)),
          if (rarity != null)
            Text(context.tr('achievements.rarity').replaceAll('{pct}', _fmtPct(rarity.pct)),
                style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }

  Widget _lockedTile(BuildContext context, Achievement a) {
    final current = a.current ?? 0;
    final next = a.tiers
        .where((t) => t.threshold > current)
        .fold<double?>(null, (m, t) => m == null || t.threshold < m ? t.threshold : m);
    final frac = next == null || next <= 0 ? null : (current / next).clamp(0.0, 1.0);
    return ListTile(
      leading: Icon(Icons.lock_outline, color: Theme.of(context).disabledColor),
      title: Text(context.tr('achievements.badge.${a.key}.name')),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.tr('achievements.badge.${a.key}.criteria')),
          if (frac != null) ...[
            const SizedBox(height: 4),
            LinearProgressIndicator(value: frac),
            Text('${current.toInt()} / ${next!.toInt()}',
                style: Theme.of(context).textTheme.bodySmall),
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

  Color? _tierColor(String? tier) => switch (tier) {
        'BRONZE' => const Color(0xFFCD7F32),
        'SILVER' => const Color(0xFF9CA3AF),
        'GOLD' => const Color(0xFFF59E0B),
        'DIAMOND' => const Color(0xFF38BDF8),
        _ => null,
      };

  Widget _showcaseSection(
      BuildContext context, WidgetRef ref, CabinetResponse c, List<Achievement> earned) {
    final pinnedKeys = (c.showcase.toList()..sort((a, b) => a.slot.compareTo(b.slot)))
        .map((s) => s.achievementKey)
        .toList();
    if (pinnedKeys.isEmpty && !c.isOwner) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Text(context.tr('achievements.showcaseHeading'),
                  style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              if (c.isOwner)
                TextButton.icon(
                  icon: const Icon(Icons.edit, size: 18),
                  label: Text(context.tr('common.edit')),
                  onPressed: () => _editShowcase(context, ref, c, earned, pinnedKeys),
                ),
            ],
          ),
        ),
        if (pinnedKeys.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(context.tr('achievements.showcaseEmpty'),
                style: Theme.of(context).textTheme.bodySmall),
          )
        else
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (final k in pinnedKeys)
                Expanded(
                  child: Column(
                    children: [
                      const Icon(Icons.military_tech, size: 32, color: Colors.amber),
                      Padding(
                        padding: const EdgeInsets.all(4),
                        child: Text(context.tr('achievements.badge.$k.name'),
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall),
                      ),
                    ],
                  ),
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
                padding: const EdgeInsets.all(16),
                child: Text(context.tr('achievements.showcaseEditHint'),
                    style: Theme.of(context).textTheme.titleSmall),
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
    if (saved != true) return;
    await ref.read(apiProvider).setShowcase(selected,
        competition: ref.read(selectedCompetitionProvider));
    ref.invalidate(cabinetProvider(c.userId));
  }

  Widget _header(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}
