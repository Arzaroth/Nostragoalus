import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../voice/voice_service.dart';
import '../feedback.dart';

/// Start or join the call in [scope].
///
/// Lives here because starting a call is an app-bar action on a room now, and
/// two screens need the same two failures reported: a denied microphone, which
/// the user can fix, and everything else.
Future<void> joinVoice(BuildContext context, WidgetRef ref, VoiceScope scope) async {
  try {
    await ref.read(voiceServiceProvider).join(scope);
  } on VoiceJoinException catch (e) {
    if (!context.mounted) return;
    showToast(context, context.tr(e.micDenied ? 'voice.error.micDenied' : 'err.serverError'));
  } catch (e) {
    if (context.mounted) showToast(context, apiMessage(context, e));
  }
}

/// The app-bar button that starts or joins a room's call. The running call is
/// then shown by [VoiceBar] at the bottom of the same screen.
class VoiceCallButton extends ConsumerWidget {
  const VoiceCallButton({super.key, required this.scope});
  final VoiceScope scope;

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
        icon: const Icon(Icons.call_outlined),
        tooltip: context.tr('voice.call'),
        onPressed: () => joinVoice(context, ref, scope),
      );
}
