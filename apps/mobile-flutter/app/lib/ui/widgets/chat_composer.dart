import 'package:flutter/material.dart';

import '../../i18n/i18n_scope.dart';

/// The compose row shared by league chat, threads and DMs: optional leading
/// actions (image, mention), the input, the send button.
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
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              ...leading,
              Expanded(
                child: TextField(
                  controller: controller,
                  onChanged: onChanged,
                  onSubmitted: (_) => onSend(),
                  decoration: InputDecoration(
                    hintText: context.tr(hintKey),
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.send),
                tooltip: context.tr('chat.send'),
                onPressed: onSend,
              ),
            ],
          ),
        ),
      );
}
