import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';

/// Calendar feed: subscribe to fixtures + pick deadlines in the device calendar,
/// copy the link, or regenerate it if it leaked.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(feedSubscriptionProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('calendar.title'))),
      body: AsyncValueView<FeedSubscriptionResponse>(
        value: feed,
        onRetry: () => ref.invalidate(feedSubscriptionProvider),
        data: (f) {
          final url = f.url;
          final webcal = f.webcalUrl.isEmpty ? url : f.webcalUrl;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(context.tr('calendar.blurb')),
              const SizedBox(height: 16),
              FilledButton.icon(
                icon: const Icon(Icons.event_available),
                label: Text(context.tr('calendar.subscribe')),
                onPressed: webcal.isEmpty
                    ? null
                    : () => launchUrl(Uri.parse(webcal), mode: LaunchMode.externalApplication),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.copy),
                label: Text(context.tr('calendar.copyLink')),
                onPressed: url.isEmpty
                    ? null
                    : () {
                        Clipboard.setData(ClipboardData(text: url));
                        ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(context.tr('common.copied'))));
                      },
              ),
              const Divider(height: 32),
              TextButton.icon(
                icon: const Icon(Icons.refresh),
                label: Text(context.tr('calendar.regenerate')),
                onPressed: () async {
                  final ok = await confirmDialog(
                    context,
                    title: context.tr('calendar.regenerate'),
                    message: context.tr('calendar.regenerateHint'),
                    confirmLabel: context.tr('calendar.regenerate'),
                  );
                  if (!ok || !context.mounted) return;
                  await runAction(context, () async {
                    await ref.read(apiProvider).regenerateFeed();
                    ref.invalidate(feedSubscriptionProvider);
                  }, successKey: 'calendar.regenerated');
                },
              ),
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(context.tr('calendar.regenerateHint'),
                    style: Theme.of(context).textTheme.bodySmall),
              ),
            ],
          );
        },
      ),
    );
  }
}
