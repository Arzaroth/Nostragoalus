import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';
import 'section_card.dart';

/// "This build", with a button that asks whether a newer one is published.
///
/// Nothing here runs on its own - no launch check, no timer, no background
/// poll. The app cannot install its own update (it was sideloaded, so the new
/// one arrives the same way this one did), so an unrequested check could only
/// produce a nag. The answer is dropped when the screen closes.
class UpdateCheckCard extends ConsumerStatefulWidget {
  const UpdateCheckCard({super.key});

  @override
  ConsumerState<UpdateCheckCard> createState() => _UpdateCheckCardState();
}

class _UpdateCheckCardState extends ConsumerState<UpdateCheckCard> {
  bool _asked = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    // Only subscribed once the button is pressed; watching unconditionally
    // would make this a launch check by another name.
    final check = _asked ? ref.watch(appReleaseProvider) : null;

    return SectionCard(
      title: context.tr('appUpdate.section'),
      children: [
        PanelRow(
          leading: const Icon(Icons.tag_outlined),
          title: Text(context.tr('appUpdate.thisBuild')),
          trailing: Text(
            isVersionedBuild ? AppConfig.appVersion : context.tr('appUpdate.devBuild'),
            style: t.score(16, color: theme.colorScheme.onSurface),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.tr('appUpdate.explainer'),
                  style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.refresh),
                label: Text(check != null && check.isLoading
                    ? context.tr('appUpdate.checking')
                    : context.tr('appUpdate.check')),
                onPressed: check != null && check.isLoading
                    ? null
                    : () {
                        // A second press must re-ask, not re-read the cached
                        // answer - "is there a newer one" is the one question
                        // whose stale answer is useless.
                        ref.invalidate(appReleaseProvider);
                        setState(() => _asked = true);
                      },
              ),
              if (check != null) ...[
                const SizedBox(height: 12),
                check.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => Text(context.tr('appUpdate.failed'),
                      style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
                  data: (r) => _Result(result: r),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.result});
  final UpdateCheck result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final body = theme.textTheme.bodySmall?.copyWith(color: t.muted);

    switch (result.state) {
      case UpdateState.current:
        return Text(context.tr('appUpdate.current', {'version': result.version ?? ''}), style: body);
      case UpdateState.unpublished:
        return Text(context.tr('appUpdate.unpublished'), style: body);
      case UpdateState.unversioned:
        return Text(context.tr('appUpdate.unversioned'), style: body);
      case UpdateState.newer:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              context.tr('appUpdate.newer', {
                'version': result.version ?? '',
                'size': formatBytes(result.sizeBytes),
              }),
              style: body,
            ),
            const SizedBox(height: 6),
            Text(context.tr('appUpdate.sideloadNote'),
                style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
            const SizedBox(height: 12),
            FilledButton.icon(
              icon: const Icon(Icons.download_outlined),
              label: Text(context.tr('appUpdate.download')),
              // The server owns the download route and sends it with the
              // release, so moving that route does not strand installed apps.
              onPressed: () => launchUrl(
                Uri.parse('${AppConfig.webBase}${result.path}'),
                mode: LaunchMode.externalApplication,
              ),
            ),
          ],
        );
    }
  }
}
