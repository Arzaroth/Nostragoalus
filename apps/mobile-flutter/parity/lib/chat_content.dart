/// The chat message wire format, ported from `apps/web-nuxt/app/utils/chat-content.ts`
/// and pinned by `shared/parity-json/chat-content.json`.
///
/// Mentions are stored in the plaintext as `@<userId>` - the id, not the name,
/// so a rename re-renders correctly - and the renderer looks the current name up
/// by id. A client that skips that step shows a raw user id where a name belongs.
library;

sealed class ChatToken {
  const ChatToken();
  Map<String, Object?> toJson();
}

class TextToken extends ChatToken {
  const TextToken(this.value);
  final String value;
  @override
  Map<String, Object?> toJson() => {'type': 'text', 'value': value};
}

class LinkToken extends ChatToken {
  const LinkToken(this.href, this.label);
  final String href;
  final String label;
  @override
  Map<String, Object?> toJson() => {'type': 'link', 'href': href, 'label': label};
}

class ImageToken extends ChatToken {
  const ImageToken(this.href);
  final String href;
  @override
  Map<String, Object?> toJson() => {'type': 'image', 'href': href};
}

class MentionToken extends ChatToken {
  const MentionToken(this.userId);
  final String userId;
  @override
  Map<String, Object?> toJson() => {'type': 'mention', 'userId': userId};
}

// A mention token `@<id>` (id: anything but whitespace, angle brackets or @), or
// an http(s) URL run.
final _tokenRe = RegExp(r'(@<[^\s<>@]+>)|(\bhttps?://[^\s<]+)', caseSensitive: false);
// Trailing prose punctuation pulled back out of a URL.
final _trailing = RegExp(r'''[.,!?;:'")\]}]+$''');
final _imageExt = RegExp(r'\.(png|jpe?g|gif|webp|avif|bmp|svg)$', caseSensitive: false);
final _mentionRe = RegExp(r'@<([^\s<>@]+)>');

bool _isImageUrl(String href) {
  final uri = Uri.tryParse(href);
  if (uri == null) return false;
  return _imageExt.hasMatch(uri.path);
}

/// Tokenize a decrypted message into renderable pieces. Nothing here trusts the
/// input as markup: text comes back verbatim for the widget layer to render.
List<ChatToken> parseChatContent(String text) {
  final tokens = <ChatToken>[];
  var last = 0;
  for (final m in _tokenRe.allMatches(text)) {
    if (m.start > last) tokens.add(TextToken(text.substring(last, m.start)));
    final mention = m.group(1);
    if (mention != null) {
      tokens.add(MentionToken(mention.substring(2, mention.length - 1)));
      last = m.start + mention.length;
    } else {
      final raw = m.group(2)!;
      final href = raw.replaceFirst(_trailing, '');
      tokens.add(_isImageUrl(href) ? ImageToken(href) : LinkToken(href, href));
      final trailing = raw.substring(href.length);
      if (trailing.isNotEmpty) tokens.add(TextToken(trailing));
      last = m.start + raw.length;
    }
  }
  if (last < text.length) tokens.add(TextToken(text.substring(last)));
  return tokens;
}

/// The user ids @-mentioned in a message, in first-seen order and deduplicated.
List<String> extractMentions(String text) {
  final ids = <String>{};
  for (final m in _mentionRe.allMatches(text)) {
    ids.add(m.group(1)!);
  }
  return ids.toList();
}

String _escapeRegExp(String s) => s.replaceAllMapped(RegExp(r'[.*+?^${}()|[\]\\]'), (m) => '\\${m[0]}');

/// Composer text written as `@DisplayName` mapped onto the stable `@<id>` form.
/// Longest names first so "@John Doe" wins over "@John".
///
/// A member with an EMPTY name is skipped, and not as tidiness: the pattern
/// would collapse to `@` followed by any non-word character, which matches the
/// `@` of a token an earlier iteration just wrote - turning every mention in the
/// message into `@<empty-id><real-id>`. One nameless member corrupted the room.
String encodeMentions(String text, List<({String userId, String name})> members) {
  var out = text;
  final ordered = [...members.where((m) => m.name.isNotEmpty)]
    ..sort((a, b) => b.name.length.compareTo(a.name.length));
  for (final m in ordered) {
    out = out.replaceAllMapped(
      RegExp('(^|\\s)@${_escapeRegExp(m.name)}(?=\\s|\$|[^\\w])'),
      (match) => '${match[1]}@<${m.userId}>',
    );
  }
  return out;
}

/// Put a stored message back into `@DisplayName` form (the edit box, and any
/// place a plain string is wanted). Unknown ids fall back to [unknownLabel].
String decodeMentions(String text, Map<String, String> names, String unknownLabel) =>
    text.replaceAllMapped(_mentionRe, (m) => '@${names[m.group(1)!] ?? unknownLabel}');
