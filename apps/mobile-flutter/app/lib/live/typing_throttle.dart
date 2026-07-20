/// One typing hint per [interval] while composing: a keystroke-per-frame stream
/// would fan out to every other participant on every letter. The web composers
/// throttle the same way, and the server does not rate-limit `chat:typing` /
/// `dm:typing` itself.
const typingThrottleInterval = Duration(seconds: 2);

bool mayNotifyTyping(DateTime? last, DateTime now, {Duration interval = typingThrottleInterval}) =>
    last == null || now.difference(last) >= interval;
