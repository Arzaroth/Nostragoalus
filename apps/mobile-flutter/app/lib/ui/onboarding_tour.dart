import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';

/// The ordered tour step keys - the i18n stems `onboarding.steps.<key>`.
/// Mirrors the web spotlight tour; on mobile it plays as a paged intro card.
const _steps = [
  'welcome',
  'competition',
  'predict',
  'champion',
  'leaderboard',
  'notifications',
  'chat',
  'done',
];

const _icons = [
  Icons.waving_hand_outlined,
  Icons.emoji_events_outlined,
  Icons.edit_note_outlined,
  Icons.military_tech_outlined,
  Icons.leaderboard_outlined,
  Icons.notifications_active_outlined,
  Icons.forum_outlined,
  Icons.check_circle_outline,
];

/// Show the one-time onboarding tour as a modal. Marks it dismissed on finish or
/// skip, so it never auto-starts again.
Future<void> showOnboardingTour(BuildContext context) => showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Dialog(child: _OnboardingTour()),
    );

class _OnboardingTour extends ConsumerStatefulWidget {
  const _OnboardingTour();
  @override
  ConsumerState<_OnboardingTour> createState() => _OnboardingTourState();
}

class _OnboardingTourState extends ConsumerState<_OnboardingTour> {
  final _page = PageController();
  int _i = 0;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    // Fire-and-forget the server dismiss; refresh the user so it won't re-open.
    try {
      await ref.read(apiProvider).dismissOnboardingTour();
      ref.invalidate(authControllerProvider);
    } catch (_) {/* the local pop still ends the tour */}
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final last = _i == _steps.length - 1;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    return SizedBox(
      height: 420,
      child: Column(
        children: [
          Align(
            alignment: AlignmentDirectional.topEnd,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: TextButton(onPressed: _finish, child: Text(context.tr('onboarding.skip'))),
            ),
          ),
          Expanded(
            child: PageView.builder(
              controller: _page,
              itemCount: _steps.length,
              onPageChanged: (i) => setState(() => _i = i),
              itemBuilder: (context, i) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircleAvatar(
                      radius: 36,
                      backgroundColor: scheme.primaryContainer,
                      child: Icon(_icons[i], size: 36, color: scheme.onPrimaryContainer),
                    ),
                    const SizedBox(height: 20),
                    Text(context.tr('onboarding.steps.${_steps[i]}.title'),
                        textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 12),
                    Text(context.tr('onboarding.steps.${_steps[i]}.body'),
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                  ],
                ),
              ),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var d = 0; d < _steps.length; d++)
                Container(
                  width: 7,
                  height: 7,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: d == _i ? scheme.primary : t.ruleStrong,
                  ),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                if (_i > 0)
                  TextButton(
                    onPressed: () => _page.previousPage(
                        duration: const Duration(milliseconds: 250), curve: Curves.ease),
                    child: Text(context.tr('onboarding.back')),
                  ),
                const Spacer(),
                FilledButton(
                  onPressed: last
                      ? _finish
                      : () => _page.nextPage(
                          duration: const Duration(milliseconds: 250), curve: Curves.ease),
                  child: Text(last ? context.tr('onboarding.done') : context.tr('onboarding.next')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
