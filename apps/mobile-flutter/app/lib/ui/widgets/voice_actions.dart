import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../voice/voice_service.dart';
import '../feedback.dart';

/// Run a voice action and report the two failures a user can act on: a denied
/// microphone, which they can fix, and everything else.
///
/// Every entry into a call goes through here - the room buttons, and accepting
/// an incoming ring - because the three used to report the same two failures
/// three different ways, one of them with no catch-all at all, so a transport
/// error left the caller staring at a dead screen.
Future<void> runVoiceAction(BuildContext context, Future<void> Function() action) async {
  try {
    await action();
  } on VoiceJoinException catch (e) {
    if (!context.mounted) return;
    showToast(context, context.tr(e.micDenied ? 'voice.error.micDenied' : 'err.serverError'));
  } catch (e) {
    if (context.mounted) showToast(context, apiMessage(context, e));
  }
}

/// Join the call in [scope].
Future<void> joinVoice(BuildContext context, WidgetRef ref, VoiceScope scope) =>
    runVoiceAction(context, () => ref.read(voiceServiceProvider).join(scope));

/// The app-bar button that starts or joins a room's call.
///
/// Hidden while this room's call is running, because [VoiceBar] takes over at
/// the bottom of the same screen; leaving both up is the pair of competing call
/// controls this replaced.
class VoiceCallButton extends ConsumerStatefulWidget {
  const VoiceCallButton({super.key, required this.scope, this.ring = const []});

  final VoiceScope scope;

  /// Who to ring once we are in. A league room rings nobody - everyone it could
  /// reach is already in the room to join. A DM rings the other party.
  final List<String> ring;

  @override
  ConsumerState<VoiceCallButton> createState() => _VoiceCallButtonState();
}

class _VoiceCallButtonState extends ConsumerState<VoiceCallButton> {
  bool _busy = false;

  Future<void> _act() async {
    setState(() => _busy = true);
    final voice = ref.read(voiceServiceProvider);
    await runVoiceAction(
        context,
        () => widget.ring.isEmpty
            ? voice.join(widget.scope)
            : voice.invite(widget.scope, widget.ring));
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final voice = ref.watch(voiceServiceProvider);
    return ValueListenableBuilder<VoiceCallState>(
      valueListenable: voice.state,
      builder: (context, state, _) {
        if (state.scope == widget.scope) return const SizedBox.shrink();
        return IconButton(
          icon: const Icon(Icons.call_outlined),
          tooltip: context.tr(widget.ring.isEmpty ? 'voice.joinVoice' : 'voice.call'),
          onPressed: _busy ? null : _act,
        );
      },
    );
  }
}
