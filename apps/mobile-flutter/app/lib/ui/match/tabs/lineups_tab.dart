import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';

/// Starting XI per side with formation, shirt number and the captain marker.
class LineupsTab extends ConsumerWidget {
  const LineupsTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchLineupsResponse>(
      value: ref.watch(matchLineupsProvider(matchId)),
      onRetry: () => ref.invalidate(matchLineupsProvider(matchId)),
      data: (res) {
        final l = res.lineups;
        if (l == null || !l.available) {
          return EmptyState(message: context.tr('match.noLineups'));
        }
        return ListView(children: [_side(context, l.home), _side(context, l.away)]);
      },
    );
  }

  Widget _side(BuildContext context, Home side) => Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(side.formation ?? '', style: Theme.of(context).textTheme.titleMedium),
            for (final p in side.startingXI)
              ListTile(
                dense: true,
                leading: Text(p.shirtNumber?.toInt().toString() ?? ''),
                title: Text(p.name),
                subtitle: p.position != null ? Text(p.position!) : null,
                trailing: p.captain ? Text(context.tr('match.captainShort')) : null,
              ),
          ],
        ),
      );
}
