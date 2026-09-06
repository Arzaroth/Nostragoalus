import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';

/// Public product roadmap - items by status, with community upvotes.
class RoadmapScreen extends ConsumerWidget {
  const RoadmapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roadmap = ref.watch(roadmapProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.roadmap'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _suggest(context, ref),
        icon: const Icon(Icons.lightbulb_outline),
        label: Text(context.tr('roadmap.suggest.submit')),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(roadmapProvider.future),
        child: AsyncValueView<RoadmapResponse>(
          value: roadmap,
          onRetry: () => ref.invalidate(roadmapProvider),
          data: (res) => res.items.isEmpty
              ? EmptyState(icon: Icons.map_outlined, message: context.tr('roadmap.empty'))
              : ListView(
                  padding: const EdgeInsets.only(top: 4, bottom: 96),
                  children: [
                    Panel(children: [for (final item in res.items) _ItemRow(item)]),
                  ],
                ),
        ),
      ),
    );
  }
}

Future<void> _suggest(BuildContext context, WidgetRef ref) async {
  final title = TextEditingController();
  final desc = TextEditingController();
  final submit = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(context.tr('roadmap.suggest.submit')),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: title,
              decoration: InputDecoration(labelText: context.tr('roadmap.suggestTitle'))),
          const SizedBox(height: 12),
          TextField(
              controller: desc,
              maxLines: 3,
              decoration: InputDecoration(labelText: context.tr('roadmap.suggestDesc'))),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.tr('common.cancel'))),
        FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.tr('roadmap.suggest.submit'))),
      ],
    ),
  );
  final suggestion = (title: title.text.trim(), description: desc.text.trim());
  title.dispose();
  desc.dispose();
  if (submit != true || suggestion.title.isEmpty || !context.mounted) return;
  await runAction(context, () async {
    await ref.read(apiProvider).suggestRoadmap(suggestion.title, suggestion.description);
    ref.invalidate(roadmapProvider);
  }, successKey: 'roadmap.suggest.thanks');
}

String roadmapStatusKey(ItemStatusValue status) => switch (status) {
      ItemStatusValue.inProgress => 'roadmap.inProgress',
      ItemStatusValue.shipped => 'roadmap.shipped',
      ItemStatusValue.suggested => 'roadmap.statusSuggested',
      _ => 'roadmap.planned',
    };

class _ItemRow extends ConsumerWidget {
  const _ItemRow(this.item);
  final Item item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
    final statusColor = switch (item.status) {
      ItemStatusValue.shipped => t.emerald,
      ItemStatusValue.inProgress => scheme.primary,
      ItemStatusValue.suggested => t.amber,
      _ => t.muted,
    };
    return PanelRow(
      title: Text(item.title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (item.description != null) Text(item.description!),
          const SizedBox(height: 6),
          Tag(context.tr(roadmapStatusKey(item.status)), color: statusColor),
        ],
      ),
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: Icon(item.viewerHasVoted ? Icons.thumb_up : Icons.thumb_up_outlined),
            color: item.viewerHasVoted ? scheme.primary : t.muted,
            onPressed: () => runAction(context, () async {
              await ref.read(apiProvider).voteRoadmap(item.id);
              ref.invalidate(roadmapProvider);
            }),
          ),
          Text('${item.voteCount.toInt()}',
              style: t.score(17, color: item.viewerHasVoted ? scheme.primary : scheme.onSurface)),
        ],
      ),
    );
  }
}
