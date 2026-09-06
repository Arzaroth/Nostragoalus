import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../../theme/app_theme.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/panel.dart';

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
          return EmptyState(icon: Icons.groups_outlined, message: context.tr('match.noLineups'));
        }
        return ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [_side(context, l.home), _side(context, l.away)],
        );
      },
    );
  }

  Widget _side(BuildContext context, Home side) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(
          title: side.formation ?? '',
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
        ),
        Panel(children: [
          for (final p in side.startingXI)
            PanelRow(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              leading: SizedBox(
                width: 28,
                child: Text(p.shirtNumber?.toInt().toString() ?? '',
                    textAlign: TextAlign.center,
                    style: t.score(17, weight: FontWeight.w600, color: t.muted)),
              ),
              title: Text(p.name),
              subtitle: p.position != null ? Text(p.position!.wire) : null,
              trailing: p.captain ? Tag(context.tr('match.captainShort'), color: t.amber) : null,
            ),
        ]),
      ],
    );
  }
}
