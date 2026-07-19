import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';

/// Generate + escrow a recovery code so the encrypted-chat identity can be
/// restored on another device. The code is shown once; the private key never
/// leaves the device except wrapped under it.
class RecoverySetupScreen extends ConsumerStatefulWidget {
  const RecoverySetupScreen({super.key});

  @override
  ConsumerState<RecoverySetupScreen> createState() => _RecoverySetupScreenState();
}

class _RecoverySetupScreenState extends ConsumerState<RecoverySetupScreen> {
  String? _code;
  bool _busy = false;

  Future<void> _generate() async {
    setState(() => _busy = true);
    try {
      final code = await ref.read(chatIdentityProvider.notifier).createRecoveryCode();
      if (mounted) setState(() => _code = code);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('err.generic'))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('recovery.title'))),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(context.tr('recovery.hint')),
            const SizedBox(height: 24),
            if (_code == null)
              FilledButton.icon(
                onPressed: _busy ? null : _generate,
                icon: _busy
                    ? const SizedBox(
                        height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.vpn_key),
                label: Text(context.tr('recovery.generate')),
              )
            else ...[
              Card(
                color: Theme.of(context).colorScheme.secondaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: SelectableText(
                    _code!,
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontFamily: 'monospace', letterSpacing: 2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(context.tr('recovery.saveWarning'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const Divider(height: 48),
            Text(context.tr('recovery.resetHint'),
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: Theme.of(context).colorScheme.error,
              ),
              onPressed: _busy ? null : _reset,
              icon: const Icon(Icons.delete_forever),
              label: Text(context.tr('recovery.reset')),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _reset() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.tr('recovery.reset')),
        content: Text(context.tr('recovery.resetConfirm')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(context.tr('common.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.tr('recovery.reset')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() { _busy = true; _code = null; });
    try {
      await ref.read(chatIdentityProvider.notifier).reset();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('recovery.resetDone'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('err.generic'))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
