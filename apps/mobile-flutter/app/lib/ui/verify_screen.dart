import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// The tamper-evident commit-reveal ledger: a hash chain of sealed predictions,
/// each opened after kickoff. The head hash is what a member records to detect
/// any later rewrite.
class VerifyScreen extends ConsumerWidget {
  const VerifyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ledger = ref.watch(commitmentsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('verify.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(commitmentsProvider.future),
        child: AsyncValueView<CommitmentsResponse>(
          value: ledger,
          onRetry: () => ref.invalidate(commitmentsProvider),
          data: (res) => ListView(
            children: [
              Card(
                margin: const EdgeInsets.all(12),
                child: ListTile(
                  leading: const Icon(Icons.verified),
                  title: Text(context.tr('verify.head')),
                  subtitle: Text('#${res.head.seq.toInt()} · ${_short(res.head.headHash)}'),
                ),
              ),
              for (final e in res.entries) _EntryTile(e),
            ],
          ),
        ),
      ),
    );
  }
}

String _short(String hash) => hash.length <= 16 ? hash : '${hash.substring(0, 8)}…${hash.substring(hash.length - 8)}';

class _EntryTile extends StatelessWidget {
  const _EntryTile(this.e);
  final Entry e;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      leading: Icon(e.opened ? Icons.lock_open : Icons.lock, size: 18),
      title: Text('#${e.seq.toInt()} · ${e.subject}'),
      subtitle: Text(_short(e.entryHash), style: const TextStyle(fontFamily: 'monospace')),
      trailing: e.opened && e.homeGoals != null
          ? Text('${e.homeGoals!.toInt()}-${e.awayGoals!.toInt()}')
          : null,
    );
  }
}
