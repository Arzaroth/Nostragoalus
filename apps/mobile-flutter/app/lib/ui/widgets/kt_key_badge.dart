import 'package:flutter/material.dart';

import '../../i18n/i18n_scope.dart';
import '../../kt/kt_providers.dart' show KtCheck;

/// How a peer's served public key compares to the transparency log. `mismatch`
/// is the substitution alarm; `absent` is a soft caution; `ok` and `unknown`
/// render nothing so the badge only ever means "look at this".
class KtKeyBadge extends StatelessWidget {
  const KtKeyBadge({super.key, required this.check});

  final KtCheck check;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return switch (check) {
      KtCheck.mismatch => _chip(
          context,
          Icons.gpp_bad,
          context.tr('kt.peer.mismatch'),
          scheme.error,
        ),
      KtCheck.absent => _chip(
          context,
          Icons.help_outline,
          context.tr('kt.peer.absent'),
          scheme.tertiary,
        ),
      KtCheck.ok || KtCheck.unknown => const SizedBox.shrink(),
    };
  }

  Widget _chip(BuildContext context, IconData icon, String label, Color color) => Tooltip(
        message: context.tr('chat.verify.notInLogHint'),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: color, fontSize: 12)),
          ],
        ),
      );
}
