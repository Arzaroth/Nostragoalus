import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';
import 'widgets/score_pill.dart';

/// i18n key for a bot persona (the API sends the kebab-case value).
String _personaKey(PersonaValue persona) => switch (persona) {
      PersonaValue.evilTwin => 'bot.persona.evilTwin',
      PersonaValue.equalizer => 'bot.persona.equalizer',
      _ => 'bot.persona.consensus',
    };

/// A bot persona's predictions (consensus / evil-twin / equalizer) - what the
/// crowd-derived bot picked for each match, beside the real score once played.
class BotScreen extends ConsumerWidget {
  const BotScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bot = ref.watch(botPredictionsProvider);
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('bot.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(botPredictionsProvider.future),
        child: AsyncValueView<BotPredictionsResponse>(
          value: bot,
          onRetry: () => ref.invalidate(botPredictionsProvider),
          data: (res) {
            if (res.predictions.isEmpty) {
              return EmptyState(icon: Icons.smart_toy_outlined, message: context.tr('bot.empty'));
            }
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                  child: Row(
                    children: [
                      Icon(Icons.smart_toy_outlined, size: 20, color: theme.colorScheme.primary),
                      const SizedBox(width: 8),
                      Text(context.tr(_personaKey(res.persona)),
                          style: theme.textTheme.headlineSmall),
                    ],
                  ),
                ),
                Panel(
                  children: [
                    for (final p in res.predictions)
                      PanelRow(
                        title: Text('${p.homeTeam} v ${p.awayTeam}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall),
                        subtitle: Text(p.roundLabel),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('${p.homeGoals.toInt()} - ${p.awayGoals.toInt()}',
                                style: t.score(22, color: theme.colorScheme.primary)),
                            const SizedBox(width: 14),
                            ScorePill(
                              status: StatusValue.from(p.status),
                              home: p.fullTimeHome?.toInt(),
                              away: p.fullTimeAway?.toInt(),
                              size: 18,
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
