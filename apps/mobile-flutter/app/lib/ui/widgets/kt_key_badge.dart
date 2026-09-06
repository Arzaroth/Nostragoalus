import 'package:flutter/material.dart';

import '../../i18n/i18n_scope.dart';
import '../../kt/kt_providers.dart' show KtCheck;
import '../../theme/app_theme.dart';
import 'panel.dart';

/// How a peer's served public key compares to the transparency log. `mismatch`
/// is the substitution alarm; `absent` is a soft caution; `ok` and `unknown`
/// render nothing so the badge only ever means "look at this".
class KtKeyBadge extends StatelessWidget {
  const KtKeyBadge({super.key, required this.check});

  final KtCheck check;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return switch (check) {
      KtCheck.mismatch => _tag(context, Icons.gpp_bad, context.tr('kt.peer.mismatch'), t.live),
      KtCheck.absent => _tag(context, Icons.help_outline, context.tr('kt.peer.absent'), t.amber),
      KtCheck.ok || KtCheck.unknown => const SizedBox.shrink(),
    };
  }

  Widget _tag(BuildContext context, IconData icon, String label, Color color) => Tooltip(
        message: context.tr('chat.verify.notInLogHint'),
        child: Tag(label, icon: icon, color: color),
      );
}
