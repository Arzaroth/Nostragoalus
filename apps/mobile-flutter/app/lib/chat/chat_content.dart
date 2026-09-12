/// The chat wire format, shared with the website.
///
/// Ported in `apps/mobile-flutter/parity/lib/chat_content.dart` and pinned by
/// `shared/parity-json/chat-content.json`, because both clients render the SAME
/// stored string: a disagreement here shows up as a raw user id in somebody's
/// chat, which is exactly how it was found.
library;

export 'package:nostragoalus_parity/chat_content.dart';
