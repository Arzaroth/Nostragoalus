import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../feedback.dart';

/// Score / outcome-only / joker editor for one match, saved into the league the
/// user picked for this competition. No cross-competition fallback: a league
/// from another competition would silently score the pick somewhere else.
class PredictionEditor extends ConsumerStatefulWidget {
  const PredictionEditor({
    super.key,
    required this.matchId,
    required this.competitionId,
    required this.homeTeam,
    required this.awayTeam,
    required this.current,
    required this.isLocked,
  });

  final String matchId;
  final String competitionId;
  final String homeTeam;
  final String awayTeam;
  final MyPrediction? current;
  final bool isLocked;

  @override
  ConsumerState<PredictionEditor> createState() => _PredictionEditorState();
}

class _PredictionEditorState extends ConsumerState<PredictionEditor> {
  late int _home = widget.current?.homeGoals ?? 0;
  late int _away = widget.current?.awayGoals ?? 0;
  late bool _outcomeOnly = widget.current?.isOutcomeOnly ?? false;
  String? _leagueId;
  bool? _jokerPending;
  bool _saving = false;

  @override
  void didUpdateWidget(PredictionEditor old) {
    super.didUpdateWidget(old);
    final now = widget.current;
    if (now?.updatedAt == old.current?.updatedAt && now?.id == old.current?.id) return;
    // A pick edited elsewhere (another device, a refetch) wins over stale local state.
    setState(() {
      _home = now?.homeGoals ?? 0;
      _away = now?.awayGoals ?? 0;
      _outcomeOnly = now?.isOutcomeOnly ?? false;
      _jokerPending = null;
    });
  }

  bool get _isJoker => _jokerPending ?? widget.current?.isJoker ?? false;

  Future<void> _save(String leagueId, ModeValue mode) async {
    setState(() => _saving = true);
    await runAction(
      context,
      () => ref.read(savePredictionProvider)(
        leagueId,
        mode,
        widget.matchId,
        PredictionInput(home: _home, away: _away, isOutcomeOnly: _outcomeOnly),
      ),
      successKey: 'picks.saved',
    );
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _toggleJoker(String leagueId, ModeValue mode) async {
    if (_saving) return;
    final next = !_isJoker;
    setState(() {
      _saving = true;
      _jokerPending = next;
    });
    final ok = await runAction(context, () async {
      await ref.read(setJokerProvider)(leagueId, mode, widget.matchId, next);
      ref.invalidate(leaguesProvider);
    });
    if (!mounted) return;
    setState(() {
      _saving = false;
      if (!ok) _jokerPending = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isLocked) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.lock),
          title: Text(context.tr('picks.locked')),
          subtitle: widget.current != null
              ? Text('${widget.current!.homeGoals} - ${widget.current!.awayGoals}')
              : null,
        ),
      );
    }

    return ref.watch(leaguesProvider).when(
          loading: () => const Center(
            child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()),
          ),
          error: (e, _) => Card(
            child: Padding(padding: const EdgeInsets.all(16), child: Text(apiMessage(context, e))),
          ),
          data: (res) {
            final candidates = res.leagues
                .where((l) => l.competition.id == widget.competitionId)
                .toList();
            if (candidates.isEmpty) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(context.tr('picks.noLeagueForCompetition')),
                ),
              );
            }
            final league = candidates.firstWhere((l) => l.id == _leagueId,
                orElse: () => candidates.first);
            return _editor(context, candidates, league);
          },
        );
  }

  Widget _editor(
    BuildContext context,
    List<LeaguesResponseLeague> candidates,
    LeaguesResponseLeague league,
  ) =>
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.tr('picks.yourPrediction'),
                  style: Theme.of(context).textTheme.titleMedium),
              if (candidates.length > 1) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: league.id,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: context.tr('picks.leagueForPick'),
                    border: const OutlineInputBorder(),
                  ),
                  items: [
                    for (final l in candidates)
                      DropdownMenuItem(value: l.id, child: Text(l.name)),
                  ],
                  onChanged: (id) => setState(() => _leagueId = id),
                ),
              ],
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _Stepper(
                      label: widget.homeTeam,
                      value: _home,
                      onChanged: (v) => setState(() => _home = v)),
                  const Text('-', style: TextStyle(fontSize: 24)),
                  _Stepper(
                      label: widget.awayTeam,
                      value: _away,
                      onChanged: (v) => setState(() => _away = v)),
                ],
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(context.tr('picks.outcomeOnly')),
                value: _outcomeOnly,
                onChanged: (v) => setState(() => _outcomeOnly = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(context.tr('picks.joker')),
                value: _isJoker,
                onChanged: _saving ? null : (_) => _toggleJoker(league.id, league.mode),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _saving ? null : () => _save(league.id, league.mode),
                icon: _saving
                    ? const SizedBox(
                        height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.save),
                label: Text(context.tr('picks.save')),
              ),
            ],
          ),
        ),
      );
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.label, required this.value, required this.onChanged});
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          SizedBox(
            width: 90,
            child: Text(label,
                textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: value > 0 ? () => onChanged(value - 1) : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text('$value', style: Theme.of(context).textTheme.headlineSmall),
              IconButton(
                onPressed: value < 20 ? () => onChanged(value + 1) : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
        ],
      );
}
