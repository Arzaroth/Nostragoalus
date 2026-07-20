import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';

/// Connected devices / sessions - review and revoke. The row holding this
/// device's bearer is labelled and sorted first, because revoking it signs you
/// out here.
class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(sessionsProvider);
    final selfToken = ref.watch(tokenStoreProvider).token;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('sessions.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(sessionsProvider.future),
        child: AsyncValueView<List<dynamic>>(
          value: sessions,
          onRetry: () => ref.invalidate(sessionsProvider),
          data: (list) {
            final rows = [
              for (final raw in list)
                if (raw is Map) raw.cast<String, dynamic>(),
            ];
            rows.sort((a, b) {
              final aSelf = _isSelf(a, selfToken), bSelf = _isSelf(b, selfToken);
              return aSelf == bSelf ? 0 : (aSelf ? -1 : 1);
            });
            if (rows.isEmpty) return EmptyState(message: context.tr('sessions.empty'));
            return ListView(
              children: [
                for (final s in rows) _SessionTile(session: s, isSelf: _isSelf(s, selfToken)),
              ],
            );
          },
        ),
      ),
    );
  }

  static bool _isSelf(Map<String, dynamic> session, String? selfToken) =>
      selfToken != null && selfToken.isNotEmpty && session['token'] == selfToken;
}

class _SessionTile extends ConsumerWidget {
  const _SessionTile({required this.session, required this.isSelf});

  final Map<String, dynamic> session;
  final bool isSelf;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final token = (session['token'] ?? session['id'] ?? '').toString();
    final device = (session['userAgent'] ?? context.tr('sessions.unknownDevice')).toString();
    final detail = (session['ipAddress'] ?? session['createdAt'] ?? '').toString();
    return ListTile(
      leading: Icon(isSelf ? Icons.smartphone : Icons.devices),
      title: Text(isSelf ? '$device - ${context.tr('sessions.current')}' : device),
      subtitle: detail.isEmpty ? null : Text(detail),
      trailing: IconButton(
        icon: const Icon(Icons.logout),
        tooltip: context.tr('sessions.revoke'),
        onPressed: token.isEmpty ? null : () => _revoke(context, ref, token),
      ),
    );
  }

  Future<void> _revoke(BuildContext context, WidgetRef ref, String token) async {
    final ok = await confirmDialog(
      context,
      title: context.tr('sessions.revoke'),
      message: context.tr(isSelf ? 'sessions.revokeCurrentConfirm' : 'sessions.revokeConfirm'),
      confirmLabel: context.tr('sessions.revoke'),
    );
    if (!ok || !context.mounted) return;
    await runAction(context, () async {
      await ref.read(apiProvider).revokeSession(token);
      ref.invalidate(sessionsProvider);
    });
  }
}
