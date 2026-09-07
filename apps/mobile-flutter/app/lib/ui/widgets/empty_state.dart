import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// "Nothing here yet", with a way forward when there is one. Scrollable so it
/// still works as the body of a `RefreshIndicator`; use [EmptyStateBody]
/// directly for an empty SECTION inside a list that already scrolls.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon, this.action});

  final String message;
  final IconData? icon;

  /// The one thing to do about it (a button).
  final Widget? action;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(32, 96, 32, 32),
        children: [EmptyStateBody(message: message, icon: icon, action: action)],
      );
}

/// The same message/icon/action recipe without the scroll view, so a screen
/// whose empty state is one section of an existing list does not have to clone
/// it - nesting [EmptyState] in another list leaves the outer viewport
/// unbounded.
class EmptyStateBody extends StatelessWidget {
  const EmptyStateBody({super.key, required this.message, this.icon, this.action});

  final String message;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 36, color: t.faint),
          const SizedBox(height: 16),
        ],
        Text(message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: t.muted)),
        if (action != null) ...[
          const SizedBox(height: 20),
          Center(child: action!),
        ],
      ],
    );
  }
}
