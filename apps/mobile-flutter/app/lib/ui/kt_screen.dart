import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../kt/kt_providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';
import 'widgets/section_card.dart';

/// Key-transparency verification: the app re-walks the server's public-key hash
/// chain and shows this user's safety number for out-of-band comparison.
class KtScreen extends ConsumerWidget {
  const KtScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kt = ref.watch(ktProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('kt.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(ktProvider.future),
        child: AsyncValueView<KtView>(
          value: kt,
          onRetry: () => ref.invalidate(ktProvider),
          data: (view) {
            final theme = Theme.of(context);
            final t = context.tokens;
            // `verification.ok` alone green-badges an empty log or a chain that
            // recomputes cleanly under a head the server made up.
            final ok = view.chainOk;
            final accent = ok ? t.emerald : t.live;
            return ListView(
              padding: const EdgeInsets.only(top: 8, bottom: 24),
              children: [
                if (view.headTampered) ...[
                  Panel(
                    tint: t.live.withValues(alpha: 0.16),
                    children: [
                      PanelRow(
                        leading: Icon(Icons.warning_amber, color: t.live),
                        title: Text(context.tr('kt.tampered'),
                            style: TextStyle(color: t.live, fontWeight: FontWeight.w600)),
                        subtitle: Text(context.tr('chat.verify.logTampered')),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
                Panel(
                  tint: accent.withValues(alpha: 0.10),
                  children: [
                    PanelRow(
                      leading: Icon(ok ? Icons.verified_user : Icons.gpp_bad, color: accent),
                      title: Text(context.tr(ok ? 'kt.verified' : 'kt.broken')),
                      subtitle: Text(ok
                          ? context.tr('kt.entries', {'n': view.entryCount})
                          : view.verification.ok
                              ? context.tr('kt.headMismatch')
                              : '${view.verification.failure} @ #${view.verification.count}'),
                    ),
                  ],
                ),
                SectionCard(
                  title: context.tr('kt.headHash'),
                  padded: true,
                  children: [
                    SelectableText(view.headHash,
                        style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace')),
                  ],
                ),
                if (view.mySafetyNumber != null)
                  SectionCard(
                    title: context.tr('kt.safetyNumber'),
                    padded: true,
                    children: [
                      SelectableText(view.mySafetyNumber!,
                          style: t.score(26, weight: FontWeight.w600, color: theme.colorScheme.onSurface)),
                      const SizedBox(height: 8),
                      Text(context.tr('kt.safetyHint'), style: theme.textTheme.bodySmall),
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
