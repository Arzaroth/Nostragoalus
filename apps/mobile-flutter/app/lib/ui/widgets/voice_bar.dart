import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../voice/voice_mesh.dart';
import '../../voice/voice_service.dart';
import 'panel.dart';

/// In-call controls for one voice room. Audio-only WebRTC mesh over the
/// signaling hub.
///
/// Shows ONLY while the call it belongs to is running. Starting a call is the
/// app-bar action on the room; a bar standing there permanently offering to join
/// was a second call control competing with that button, and in a DM the two sat
/// on the same screen.
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

  @override
  Widget build(BuildContext context) {
    final voice = ref.watch(voiceServiceProvider);
    final t = context.tokens;
    return ValueListenableBuilder<VoiceCallState>(
      valueListenable: voice.state,
      builder: (context, state, _) {
        final ours = state.scope == widget.scope;
        _syncTicker(ours && state is VoiceInCall);
        if (!ours) return const SizedBox.shrink();
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
