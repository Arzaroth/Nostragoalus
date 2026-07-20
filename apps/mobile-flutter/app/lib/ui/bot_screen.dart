import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/score_pill.dart';

/// i18n key for a bot persona (the API sends the kebab-case value).
String _personaKey(String persona) => switch (persona) {
      'evil-twin' => 'bot.persona.evilTwin',
      'equalizer' => 'bot.persona.equalizer',
      _ => 'bot.persona.consensus',
    };

/// A bot persona's predictions (consensus / evil-twin / equalizer) - what the
/// crowd-derived bot picked for each match.
class BotScreen extends ConsumerWidget {
  const BotScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bot = ref.watch(botPredictionsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('bot.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(botPredictionsProvider.future),
        child: AsyncValueView<BotPredictionsResponse>(
          value: bot,
          onRetry: () => ref.invalidate(botPredictionsProvider),
          data: (res) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Chip(
                  avatar: const Icon(Icons.smart_toy, size: 18),
                  label: Text(context.tr(_personaKey(res.persona))),
                ),
              ),
              for (final p in res.predictions)
                ListTile(
                  title: Text('${p.homeTeam} v ${p.awayTeam}'),
                  subtitle: Text(p.roundLabel),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${p.homeGoals.toInt()}-${p.awayGoals.toInt()}',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(width: 8),
                      ScorePill(
                          status: p.status,
                          home: p.fullTimeHome?.toInt(),
                          away: p.fullTimeAway?.toInt()),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
