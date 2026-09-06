import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../chat/chat_providers.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';
import '../recovery_setup_screen.dart';
import 'panel.dart';

/// Asks for the recovery code and unlocks the chat identity on this device.
/// Used both when the device has never held the key and when the key it holds
/// no longer matches the account ([ChatState.keyMismatch]), where the message is
/// an alarm and a hard identity reset is offered as the second way out.
class ChatRecoveryGate extends ConsumerStatefulWidget {
  const ChatRecoveryGate({
    super.key,
    this.messageKey = 'chat.recoveryNeeded',
    this.icon = Icons.lock_outline,
    this.danger = false,
    this.offerReset = false,
  });

  final String messageKey;
  final IconData icon;
  final bool danger;
  final bool offerReset;

  @override
  ConsumerState<ChatRecoveryGate> createState() => _ChatRecoveryGateState();
}

class _ChatRecoveryGateState extends ConsumerState<ChatRecoveryGate> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _recover() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final failed = context.tr('chat.recoverFailed');
    try {
      await ref.read(chatIdentityProvider.notifier).recover(_code.text.trim());
    } catch (_) {
      if (mounted) setState(() => _error = failed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final accent = widget.danger ? t.live : t.muted;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
      shrinkWrap: true,
      children: [
        Panel(
          margin: EdgeInsets.zero,
          padding: const EdgeInsets.all(20),
          dividers: false,
          tint: widget.danger ? t.live.withValues(alpha: 0.06) : null,
          children: [
            Icon(widget.icon, size: 36, color: accent),
            const SizedBox(height: 12),
            Text(
              context.tr(widget.messageKey),
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: widget.danger ? t.live : null),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _code,
              decoration: InputDecoration(
                labelText: context.tr('chat.recoveryCode'),
                errorText: _error,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _recover,
              child: Text(context.tr('chat.recover')),
            ),
            if (widget.offerReset) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: t.live),
                icon: const Icon(Icons.delete_forever_outlined, size: 18),
                label: Text(context.tr('chat.reset.button')),
                onPressed: _busy
                    ? null
                    : () => Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => const RecoverySetupScreen(),
                        )),
              ),
            ],
          ],
        ),
      ],
    );
  }
}
