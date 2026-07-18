import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';
import 'widgets/async_value_view.dart';

/// End-to-end-encrypted league chat. The identity bootstraps automatically on a
/// device that has never chatted; a fresh device with an escrowed identity is
/// gated on the recovery code.
class LeagueChatScreen extends ConsumerWidget {
  const LeagueChatScreen({super.key, required this.leagueId, required this.name});
  final String leagueId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final identity = ref.watch(chatIdentityProvider);
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: identity.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(child: Text(context.tr('err.generic'))),
        data: (state) => state.needsRecovery
            ? _RecoveryGate(leagueId: leagueId)
            : _ChatBody(leagueId: leagueId),
      ),
    );
  }
}

class _RecoveryGate extends ConsumerStatefulWidget {
  const _RecoveryGate({required this.leagueId});
  final String leagueId;
  @override
  ConsumerState<_RecoveryGate> createState() => _RecoveryGateState();
}

class _RecoveryGateState extends ConsumerState<_RecoveryGate> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _recover() async {
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(chatIdentityProvider.notifier).recover(_code.text.trim());
    } catch (_) {
      setState(() => _error = context.tr('chat.recoverFailed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock, size: 40),
              const SizedBox(height: 12),
              Text(context.tr('chat.recoveryNeeded'), textAlign: TextAlign.center),
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
            ],
          ),
        ),
      );
}

class _ChatBody extends ConsumerStatefulWidget {
  const _ChatBody({required this.leagueId});
  final String leagueId;
  @override
  ConsumerState<_ChatBody> createState() => _ChatBodyState();
}

class _ChatBodyState extends ConsumerState<_ChatBody> {
  final _input = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(sendChatProvider)(widget.leagueId, text);
      _input.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(leagueChatProvider(widget.leagueId));
    return Column(
      children: [
        Expanded(
          child: AsyncValueView<LeagueChatView>(
            value: chat,
            onRetry: () => ref.invalidate(leagueChatProvider(widget.leagueId)),
            data: (view) => switch (view.state) {
              ChatState.disabled => Center(child: Text(context.tr('chat.disabled'))),
              ChatState.awaitingKey => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(context.tr('chat.awaitingKey'), textAlign: TextAlign.center),
                  ),
                ),
              ChatState.needsIdentity =>
                const Center(child: CircularProgressIndicator()),
              ChatState.ready => view.lines.isEmpty
                  ? Center(child: Text(context.tr('chat.empty')))
                  : ListView.builder(
                      reverse: true,
                      itemCount: view.lines.length,
                      itemBuilder: (context, i) {
                        final line = view.lines[view.lines.length - 1 - i];
                        return ListTile(
                          dense: true,
                          title: Text(line.text ?? context.tr('chat.undecryptable'),
                              style: line.text == null
                                  ? const TextStyle(fontStyle: FontStyle.italic)
                                  : null),
                          subtitle: Text(line.createdAt),
                        );
                      },
                    ),
            },
          ),
        ),
        if (chat.valueOrNull?.state == ChatState.ready)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: context.tr('chat.compose'),
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: _sending
                        ? const SizedBox(
                            height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send),
                    onPressed: _sending ? null : _send,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
