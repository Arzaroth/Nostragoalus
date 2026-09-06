import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../voice/voice_mesh.dart';
import '../../voice/voice_service.dart';
import 'panel.dart';

/// Join / in-call controls for one voice room. Audio-only WebRTC mesh over the
/// signaling hub. Only the bar of the room the user is actually in shows the
/// in-call controls; every other bar keeps offering its own join.
class VoiceBar extends ConsumerStatefulWidget {
  const VoiceBar({super.key, required this.scope});
  final VoiceScope scope;

  @override
  ConsumerState<VoiceBar> createState() => _VoiceBarState();
}

class _VoiceBarState extends ConsumerState<VoiceBar> {
  Timer? _tick;

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _syncTicker(bool inCall) {
    if (inCall == (_tick != null)) return;
    _tick?.cancel();
    _tick = inCall
        ? Timer.periodic(const Duration(seconds: 1), (_) {
            if (mounted) setState(() {});
          })
        : null;
  }

  Future<void> _join(VoiceService voice) async {
    try {
      await voice.join(widget.scope);
    } on VoiceJoinException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(context.tr(e.micDenied ? 'voice.error.micDenied' : 'err.serverError')),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final voice = ref.watch(voiceServiceProvider);
    final t = context.tokens;
    return ValueListenableBuilder<VoiceCallState>(
      valueListenable: voice.state,
      builder: (context, state, _) {
        final ours = state.scope == widget.scope;
        _syncTicker(ours && state is VoiceInCall);
        if (!ours) {
          return ColoredBox(
            color: t.board,
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Hairline(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: OutlinedButton.icon(
                        onPressed: () => _join(voice),
                        icon: const Icon(Icons.call_outlined, size: 18),
                        label: Text(context.tr('voice.join')),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }
        final live = state is VoiceInCall && state.established;
        final accent = live ? t.emerald : t.amber;
        return ColoredBox(
          color: t.raised,
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Hairline(),
                Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 8, 4),
                  child: Row(
                    children: [
                      Icon(Icons.graphic_eq, size: 20, color: accent),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _label(context, state),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(color: live ? Theme.of(context).colorScheme.onSurface : t.muted),
                        ),
                      ),
                      if (state is VoiceInCall)
                        IconButton(
                          icon: Icon(state.muted ? Icons.mic_off : Icons.mic_none_outlined,
                              color: state.muted ? t.amber : t.muted),
                          tooltip: context.tr(state.muted ? 'voice.unmute' : 'voice.mute'),
                          onPressed: voice.toggleMute,
                        ),
                      IconButton(
                        icon: Icon(Icons.call_end, color: t.live),
                        tooltip: context.tr('voice.hangup'),
                        onPressed: voice.leave,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _label(BuildContext context, VoiceCallState state) {
    if (state is VoiceConnecting) {
      return context.tr(state.reconnecting ? 'voice.reconnecting' : 'voice.connecting');
    }
    if (state is VoiceInCall) {
      if (!state.established) return context.tr('voice.ringing');
      final secs = DateTime.now().difference(state.startedAt).inSeconds;
      return '${context.tr('voice.inCall', {'n': state.roster.length})} · ${formatCallDuration(secs)}';
    }
    return context.tr('voice.connecting');
  }
}
