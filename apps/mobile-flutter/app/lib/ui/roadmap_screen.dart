import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// Public product roadmap - items by status, with community upvotes.
class RoadmapScreen extends ConsumerWidget {
  const RoadmapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roadmap = ref.watch(roadmapProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.roadmap'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(roadmapProvider.future),
        child: AsyncValueView<RoadmapResponse>(
          value: roadmap,
          onRetry: () => ref.invalidate(roadmapProvider),
          data: (res) => ListView(
            children: [for (final item in res.items) _ItemCard(item)],
          ),
        ),
      ),
    );
  }
}

class _ItemCard extends ConsumerWidget {
  const _ItemCard(this.item);
  final Item item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: ListTile(
        title: Text(item.title),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (item.description != null) Text(item.description!),
            const SizedBox(height: 4),
            Chip(
              label: Text(item.status, style: const TextStyle(fontSize: 11)),
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
            ),
          ],
        ),
        isThreeLine: item.description != null,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              icon: Icon(item.viewerHasVoted ? Icons.thumb_up : Icons.thumb_up_outlined),
              color: item.viewerHasVoted ? Theme.of(context).colorScheme.primary : null,
              onPressed: () async {
                await ref.read(apiProvider).voteRoadmap(item.id);
                ref.invalidate(roadmapProvider);
              },
            ),
            Text('${item.voteCount.toInt()}'),
          ],
        ),
      ),
    );
  }
}
