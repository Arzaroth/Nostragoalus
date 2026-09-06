import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../feedback.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/panel.dart';

/// Streams and highlights for the match. Tapping opens the link (the web
/// embeds/opens it); the share sheet is the explicit trailing action.
class MediaTab extends ConsumerWidget {
  const MediaTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchMediaResponse>(
      value: ref.watch(matchMediaProvider(matchId)),
      onRetry: () => ref.invalidate(matchMediaProvider(matchId)),
      data: (res) => res.media.isEmpty
          ? EmptyState(icon: Icons.live_tv_outlined, message: context.tr('match.noMedia'))
          : ListView(
              padding: const EdgeInsets.only(top: 8, bottom: 24),
              children: [
                Panel(children: [
                  for (final m in res.media)
                    PanelRow(
                      leading: Icon(switch (m.kind) {
                        MediaKindValue.live => Icons.live_tv_outlined,
                        MediaKindValue.highlights => Icons.movie_outlined,
                        _ => Icons.replay_outlined,
                      }),
                      title: Text(m.label ?? m.kind.wire),
                      subtitle: Text(m.url, maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: const Icon(Icons.open_in_new, size: 18),
                      onTap: () => runAction(
                        context,
                        () async {
                          final ok = await launchUrl(Uri.parse(m.url),
                              mode: LaunchMode.externalApplication);
                          if (!ok) throw Exception('cannot open ${m.url}');
                        },
                      ),
                    ),
                ]),
              ],
            ),
    );
  }
}
