import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../chat/chat_providers.dart';
import '../../i18n/i18n_scope.dart';
import '../recovery_setup_screen.dart';

/// Asks for the recovery code and unlocks the chat identity on this device.
/// Used both when the device has never held the key and when the key it holds
/// no longer matches the account ([ChatState.keyMismatch]), where the message is
/// an alarm and a hard identity reset is offered as the second way out.
class ChatRecoveryGate extends ConsumerStatefulWidget {
  const ChatRecoveryGate({
    super.key,
    this.messageKey = 'chat.recoveryNeeded',
    this.icon = Icons.lock,
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
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      shrinkWrap: true,
      children: [
        Icon(widget.icon, size: 40, color: widget.danger ? scheme.error : null),
        const SizedBox(height: 12),
        Text(
          context.tr(widget.messageKey),
          textAlign: TextAlign.center,
          style: widget.danger ? TextStyle(color: scheme.error) : null,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _code,
          decoration: InputDecoration(
            labelText: context.tr('chat.recoveryCode'),
            border: const OutlineInputBorder(),
            errorText: _error,
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _recover,
          child: Text(context.tr('chat.recover')),
        ),
        if (widget.offerReset) ...[
          const SizedBox(height: 24),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: scheme.error),
            icon: const Icon(Icons.delete_forever),
            label: Text(context.tr('chat.reset.button')),
            onPressed: _busy
                ? null
                : () => Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => const RecoverySetupScreen(),
                    )),
          ),
        ],
      ],
    );
  }
}
