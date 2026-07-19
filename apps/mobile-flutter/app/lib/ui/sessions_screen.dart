import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// Connected devices / sessions - review and revoke.
class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(sessionsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('sessions.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(sessionsProvider.future),
        child: AsyncValueView<List<dynamic>>(
          value: sessions,
          onRetry: () => ref.invalidate(sessionsProvider),
          data: (list) => list.isEmpty
              ? Center(child: Text(context.tr('sessions.empty')))
              : ListView(
                  children: [
                    for (final raw in list)
                      Builder(builder: (context) {
                        final s = (raw as Map).cast<String, dynamic>();
                        final token = (s['token'] ?? s['id'] ?? '').toString();
                        return ListTile(
                          leading: const Icon(Icons.devices),
                          title: Text((s['userAgent'] ?? context.tr('sessions.unknownDevice'))
                              .toString()),
                          subtitle: Text((s['ipAddress'] ?? s['createdAt'] ?? '').toString()),
                          trailing: IconButton(
                            icon: const Icon(Icons.logout),
                            tooltip: context.tr('sessions.revoke'),
                            onPressed: token.isEmpty
                                ? null
                                : () async {
                                    await ref.read(apiProvider).revokeSession(token);
                                    ref.invalidate(sessionsProvider);
                                  },
                          ),
                        );
                      }),
                  ],
                ),
        ),
      ),
    );
  }
}
