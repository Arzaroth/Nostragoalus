import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/panel.dart';

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
      if (mounted) showToast(context, context.tr('err.generic'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('recovery.title'))),
      body: ListView(
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Text(context.tr('recovery.hint'),
                style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
          ),
          Panel(
            padding: const EdgeInsets.all(16),
            dividers: false,
            children: [
              if (_code == null)
                FilledButton.icon(
                  onPressed: _busy ? null : _generate,
                  icon: _busy
                      ? const SizedBox(
                          height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.vpn_key_outlined),
                  label: Text(context.tr('recovery.generate')),
                )
              else ...[
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: t.raised,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: SelectableText(
                      _code!,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge?.copyWith(fontFamily: 'monospace'),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.warning_amber_outlined, size: 18, color: t.amber),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(context.tr('recovery.saveWarning'),
                          style: theme.textTheme.bodySmall?.copyWith(color: t.amber)),
                    ),
                  ],
                ),
              ],
            ],
          ),
          PanelHeading(title: context.tr('recovery.reset')),
          Panel(
            padding: const EdgeInsets.all(16),
            dividers: false,
            children: [
              Text(context.tr('recovery.resetHint'), style: theme.textTheme.bodySmall),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: t.live),
                onPressed: _busy ? null : _reset,
                icon: const Icon(Icons.delete_forever_outlined),
                label: Text(context.tr('recovery.reset')),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _reset() async {
    final confirmed = await confirmDialog(
      context,
      title: context.tr('recovery.reset'),
      message: context.tr('recovery.resetConfirm'),
      confirmLabel: context.tr('recovery.reset'),
    );
    if (!confirmed || !mounted) return;
    setState(() { _busy = true; _code = null; });
    try {
      await ref.read(chatIdentityProvider.notifier).reset();
      if (mounted) showToast(context, context.tr('recovery.resetDone'));
    } catch (_) {
      if (mounted) showToast(context, context.tr('err.generic'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
