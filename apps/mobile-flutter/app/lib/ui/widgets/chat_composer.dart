import 'package:flutter/material.dart';

import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';

/// The compose bar shared by league chat, threads and DMs: optional leading
/// actions (image, mention), the input, the filled send button. Sits on the
/// board colour under a hairline.
class ChatComposer extends StatelessWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.onSend,
    this.hintKey = 'chat.compose',
    this.onChanged,
    this.leading = const <Widget>[],
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final String hintKey;
  final ValueChanged<String>? onChanged;
  final List<Widget> leading;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: context.tokens.board,
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Hairline(),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
              child: Row(
                children: [
                  ...leading,
                  Expanded(
                    child: TextField(
                      controller: controller,
                      onChanged: onChanged,
                      onSubmitted: (_) => onSend(),
                      textInputAction: TextInputAction.send,
                      decoration: InputDecoration(
                        hintText: context.tr(hintKey),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    style: IconButton.styleFrom(
                      backgroundColor: scheme.primary,
                      foregroundColor: scheme.onPrimary,
                      shape: const CircleBorder(),
                      minimumSize: const Size(44, 44),
                    ),
                    icon: const Icon(Icons.send, size: 20),
                    tooltip: context.tr('chat.send'),
                    onPressed: onSend,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
