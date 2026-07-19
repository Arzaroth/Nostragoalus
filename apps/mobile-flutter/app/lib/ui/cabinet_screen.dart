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
                if (c.trophies.isNotEmpty) ...[
                  _header(context, context.tr('achievements.trophiesHeading')),
                  for (final t in c.trophies)
                    ListTile(
                      leading: const Icon(Icons.emoji_events, color: Colors.amber),
                      title: Text(t.type),
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
                for (final a in earned)
                  ListTile(
                    leading: const Icon(Icons.military_tech),
                    title: Text(a.key),
                    subtitle: Text(a.category),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _header(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}
