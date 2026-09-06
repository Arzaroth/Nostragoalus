import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';

/// The tamper-evident commit-reveal ledger: a hash chain of sealed predictions,
/// each opened after kickoff. The head hash is what a member records to detect
/// any later rewrite.
class VerifyScreen extends ConsumerWidget {
  const VerifyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ledger = ref.watch(commitmentsProvider);
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('verify.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(commitmentsProvider.future),
        child: AsyncValueView<CommitmentsResponse>(
          value: ledger,
          onRetry: () => ref.invalidate(commitmentsProvider),
          data: (res) => ListView(
            padding: const EdgeInsets.only(top: 8, bottom: 24),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Text(context.tr('verify.sub'),
                    style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
              ),
              Panel(
                tint: t.emerald.withValues(alpha: 0.08),
                children: [
                  PanelRow(
                    leading: Icon(Icons.verified_outlined, color: t.emerald),
                    title: Text(context.tr('verify.head', {'seq': res.head.seq.toInt()})),
                    subtitle: Text(_short(res.head.headHash),
                        style: const TextStyle(fontFamily: 'monospace')),
                  ),
                ],
              ),
              if (res.entries.isNotEmpty) ...[
                PanelHeading(
                  title: context.tr('verify.recent'),
                  trailing: '${res.entries.length}',
                ),
                Panel(children: [for (final e in res.entries) _EntryRow(e)]),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _short(String hash) => hash.length <= 16 ? hash : '${hash.substring(0, 8)}…${hash.substring(hash.length - 8)}';

class _EntryRow extends StatelessWidget {
  const _EntryRow(this.e);
  final Entry e;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final opened = e.opened && e.homeGoals != null;
    return PanelRow(
      leading: Icon(e.opened ? Icons.lock_open_outlined : Icons.lock_outline,
          color: e.opened ? t.emerald : t.faint),
      title: Text('#${e.seq.toInt()} · ${e.subject}'),
      subtitle: Text(_short(e.entryHash), style: const TextStyle(fontFamily: 'monospace')),
      trailing: opened
          ? Text('${e.homeGoals!.toInt()}-${e.awayGoals!.toInt()}',
              style: t.score(22, color: Theme.of(context).colorScheme.onSurface))
          : Tag(context.tr('verify.sealed'), icon: Icons.lock_outline),
    );
  }
}
