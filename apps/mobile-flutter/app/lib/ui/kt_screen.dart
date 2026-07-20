import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../kt/kt_providers.dart';
import 'widgets/async_value_view.dart';

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
            final scheme = Theme.of(context).colorScheme;
            // `verification.ok` alone green-badges an empty log or a chain that
            // recomputes cleanly under a head the server made up.
            final ok = view.chainOk;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (view.headTampered)
                  Card(
                    color: scheme.error,
                    child: ListTile(
                      leading: Icon(Icons.warning_amber, color: scheme.onError),
                      title: Text(context.tr('kt.tampered'),
                          style: TextStyle(
                              color: scheme.onError, fontWeight: FontWeight.bold)),
                      subtitle: Text(context.tr('chat.verify.logTampered'),
                          style: TextStyle(color: scheme.onError)),
                    ),
                  ),
                if (view.headTampered) const SizedBox(height: 12),
                Card(
                  color: ok ? scheme.secondaryContainer : scheme.errorContainer,
                  child: ListTile(
                    leading: Icon(ok ? Icons.verified_user : Icons.gpp_bad),
                    title: Text(context.tr(ok ? 'kt.verified' : 'kt.broken')),
                    subtitle: Text(ok
                        ? context.tr('kt.entries', {'n': view.entryCount})
                        : view.verification.ok
                            ? context.tr('kt.headMismatch')
                            : '${view.verification.failure} @ #${view.verification.count}'),
                  ),
                ),
                const SizedBox(height: 16),
                Text(context.tr('kt.headHash'), style: Theme.of(context).textTheme.labelMedium),
                SelectableText(view.headHash,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                const SizedBox(height: 24),
                if (view.mySafetyNumber != null) ...[
                  Text(context.tr('kt.safetyNumber'),
                      style: Theme.of(context).textTheme.labelMedium),
                  const SizedBox(height: 4),
                  SelectableText(view.mySafetyNumber!,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontFamily: 'monospace', letterSpacing: 2)),
                  const SizedBox(height: 8),
                  Text(context.tr('kt.safetyHint'),
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
