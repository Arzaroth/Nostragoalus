import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// The nations board: every team in the competition with its still-in / knocked-
/// out state (the web renders this as a Leaflet world map; the geographic layout
/// is web-only, but the who's-in/out data is the useful part on mobile).
class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teams = ref.watch(teamsProvider);
    final eliminated = ref.watch(eliminatedProvider).valueOrNull?.toSet() ?? const <String>{};
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.map'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(eliminatedProvider);
          ref.invalidate(teamsProvider);
          await ref.read(teamsProvider.future);
        },
        child: AsyncValueView<TeamsResponse>(
          value: teams,
          onRetry: () => ref.invalidate(teamsProvider),
          data: (res) {
            final sorted = [...res.teams]..sort((a, b) {
                final ae = eliminated.contains(a.code), be = eliminated.contains(b.code);
                if (ae != be) return ae ? 1 : -1; // still-in first
                return a.name.compareTo(b.name);
              });
            final stillIn = sorted.where((t) => !eliminated.contains(t.code)).length;
            return ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    context.tr('map.stillIn').replaceAll('{n}', '$stillIn'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                for (final t in sorted)
                  Builder(builder: (context) {
                    final out = eliminated.contains(t.code);
                    return ListTile(
                      leading: Icon(out ? Icons.cancel : Icons.check_circle,
                          color: out ? Theme.of(context).disabledColor : Colors.green),
                      title: Text(
                        t.name,
                        style: out
                            ? TextStyle(
                                decoration: TextDecoration.lineThrough,
                                color: Theme.of(context).disabledColor)
                            : null,
                      ),
                      subtitle: out ? Text(context.tr('map.eliminated')) : null,
                      trailing: Text(t.code),
                    );
                  }),
              ],
            );
          },
        ),
      ),
    );
  }
}
