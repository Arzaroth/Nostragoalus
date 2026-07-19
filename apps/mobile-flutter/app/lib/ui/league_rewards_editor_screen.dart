import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// The full per-criterion prize editor (owner/moderator). Each criterion gets a
/// label + optional note + link; a blank label removes that prize. Replace-set:
/// the save sends the whole desired list.
const _criteria = [
  'OVERALL',
  'WOODEN_SPOON',
  'GROUP_PHASE',
  'KNOCKOUT_PHASE',
  'FINALIST',
  'MADAME_IRMA',
  'GROUP_ORACLE',
  'KNOCKOUT_ORACLE',
  'SHARPSHOOTER',
  'GOAL_DIFF_GURU',
  'TEAM_SPECIALIST',
];

class LeagueRewardsEditorScreen extends ConsumerWidget {
  const LeagueRewardsEditorScreen({super.key, required this.leagueId});
  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.editPrizes'))),
      body: AsyncValueView<List<dynamic>>(
        value: ref.watch(leagueRewardsProvider(leagueId)),
        onRetry: () => ref.invalidate(leagueRewardsProvider(leagueId)),
        data: (rewards) {
          final byType = <String, Map>{};
          for (final r in rewards.cast<Map>()) {
            byType[(r['type'] ?? '').toString()] = (r['reward'] as Map?) ?? const {};
          }
          return _RewardsForm(leagueId: leagueId, existing: byType);
        },
      ),
    );
  }
}

class _RewardsForm extends ConsumerStatefulWidget {
  const _RewardsForm({required this.leagueId, required this.existing});
  final String leagueId;
  final Map<String, Map> existing;
  @override
  ConsumerState<_RewardsForm> createState() => _RewardsFormState();
}

class _RewardsFormState extends ConsumerState<_RewardsForm> {
  final _label = <String, TextEditingController>{};
  final _note = <String, TextEditingController>{};
  final _link = <String, TextEditingController>{};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    for (final type in _criteria) {
      final r = widget.existing[type];
      _label[type] = TextEditingController(text: (r?['label'] ?? '').toString());
      _note[type] = TextEditingController(text: (r?['note'] ?? '').toString());
      _link[type] = TextEditingController(text: (r?['link'] ?? '').toString());
    }
  }

  @override
  void dispose() {
    for (final c in [..._label.values, ..._note.values, ..._link.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final items = <Map<String, dynamic>>[];
      for (final type in _criteria) {
        final label = _label[type]!.text.trim();
        if (label.isEmpty) continue; // blank label => no prize for this criterion
        final note = _note[type]!.text.trim();
        final link = _link[type]!.text.trim();
        items.add({
          'type': type,
          'label': label,
          if (note.isNotEmpty) 'note': note,
          if (link.isNotEmpty) 'link': link,
        });
      }
      await ref.read(apiProvider).updateLeagueRewards(widget.leagueId, items);
      ref.invalidate(leagueRewardsProvider(widget.leagueId));
      ref.invalidate(leagueDetailProvider(widget.leagueId));
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('err.generic'))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(context.tr('leagues.editPrizesHint'), style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        for (final type in _criteria)
          Card(
            margin: const EdgeInsets.symmetric(vertical: 6),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.tr('reward.criterion.$type.name'),
                      style: Theme.of(context).textTheme.titleSmall),
                  TextField(
                    controller: _label[type],
                    decoration: InputDecoration(labelText: context.tr('leagues.prizeLabel')),
                  ),
                  TextField(
                    controller: _note[type],
                    decoration: InputDecoration(labelText: context.tr('leagues.prizeNote')),
                  ),
                  TextField(
                    controller: _link[type],
                    keyboardType: TextInputType.url,
                    decoration: InputDecoration(labelText: context.tr('leagues.prizeLink')),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(context.tr('common.save')),
        ),
      ],
    );
  }
}
