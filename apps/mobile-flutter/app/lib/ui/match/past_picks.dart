import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/panel.dart';

/// The "counterfactual" - how an earlier prediction would have scored vs the one
/// the user kept. Only shown once there's a live/final scope to compare against.
class PastPicks extends ConsumerWidget {
  const PastPicks({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(pastPicksProvider(matchId)).maybeWhen(
          data: (res) {
            final earlier = res.earlier;
            if (res.scope == ScopeValue.none || earlier == null) return const SizedBox.shrink();
            final kept = res.kept;
            final t = context.tokens;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PanelHeading(
                  title: context.tr('pastPick.title'),
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                ),
                Panel(
                  margin: EdgeInsets.zero,
                  children: [
                    PanelRow(
                      leading: Icon(Icons.history, color: t.muted),
                      title: Text(context.tr('pastPick.earlier', {
                        'score': '${earlier.home.toInt()}-${earlier.away.toInt()}',
                        'n': earlier.points.toInt(),
                      })),
                      trailing: Text('${earlier.points.toInt()}', style: t.score(22, color: t.muted)),
                    ),
                    if (kept != null)
                      PanelRow(
                        leading: Icon(Icons.check, color: t.emerald),
                        title: Text(context.tr('pastPick.kept', {
                          'score': '${kept.home.toInt()}-${kept.away.toInt()}',
                          'n': kept.points.toInt(),
                        })),
                        trailing: Text('${kept.points.toInt()}',
                            style: t.score(22, color: kept.points >= earlier.points ? t.emerald : t.live)),
                      ),
                  ],
                ),
              ],
            );
          },
          orElse: () => const SizedBox.shrink(),
        );
  }
}
