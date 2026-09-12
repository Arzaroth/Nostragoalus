import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../chat/call_log.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';

/// One "call started / ended / missed" line in a chat timeline. Centred and
/// quiet, so it reads as something that happened in the room rather than as
/// something somebody said.
class CallLineTile extends StatelessWidget {
  const CallLineTile({super.key, required this.call});
  final Call call;

  @override
  Widget build(BuildContext context) {
    final parts = callLineText(call, context.tr('chat.unknownUser'));
    if (parts == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final t = context.tokens;
    final missed = call.status == CallStatusValue.missed;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(missed ? Icons.call_missed : Icons.call_outlined,
              size: 14, color: missed ? theme.colorScheme.error : t.faint),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              context.tr(parts.$1, parts.$2),
              textAlign: TextAlign.center,
              style: theme.textTheme.labelSmall
                  ?.copyWith(color: missed ? theme.colorScheme.error : t.muted),
            ),
          ),
        ],
      ),
    );
  }
}
