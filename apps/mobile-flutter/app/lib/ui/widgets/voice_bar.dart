import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../voice/voice_service.dart';

/// Join / in-call controls for a voice room (a league room here). Audio-only
/// WebRTC mesh over the signaling hub.
class VoiceBar extends ConsumerWidget {
  const VoiceBar({super.key, required this.scope});
  final VoiceScope scope;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final voice = ref.watch(voiceServiceProvider);
    return ValueListenableBuilder<bool>(
      valueListenable: voice.inCall,
      builder: (context, inCall, _) {
        if (!inCall) {
          return Padding(
            padding: const EdgeInsets.all(8),
            child: FilledButton.tonalIcon(
              onPressed: () => voice.join(scope),
              icon: const Icon(Icons.call),
              label: Text(context.tr('voice.join')),
            ),
          );
        }
        final scheme = Theme.of(context).colorScheme;
        return Material(
          color: scheme.secondaryContainer,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(
              children: [
                const Icon(Icons.graphic_eq),
                const SizedBox(width: 8),
                ValueListenableBuilder<List<String>>(
                  valueListenable: voice.roster,
                  builder: (context, roster, _) =>
                      Text(context.tr('voice.inCall', {'n': roster.length})),
                ),
                const Spacer(),
                ValueListenableBuilder<bool>(
                  valueListenable: voice.muted,
                  builder: (context, muted, _) => IconButton(
                    icon: Icon(muted ? Icons.mic_off : Icons.mic),
                    onPressed: voice.toggleMute,
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.call_end, color: scheme.error),
                  onPressed: voice.leave,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
