import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api_client.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_providers.dart';
import 'package:nostragoalus/chat/dm_providers.dart';
import 'package:nostragoalus/chat/outbox.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/kt/key_transparency.dart';
import 'package:nostragoalus/kt/kt_providers.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/dm_room_screen.dart';
import 'package:nostragoalus/ui/kt_screen.dart';
import 'package:nostragoalus/ui/league_chat_screen.dart';
import 'package:nostragoalus/ui/moderation_screen.dart';
import 'package:nostragoalus/ui/two_factor_screen.dart';
import 'package:nostragoalus/ui/widgets/chat_message_list.dart';
import 'package:nostragoalus/ui/widgets/kt_key_badge.dart';
import 'package:nostragoalus/ui/widgets/typing_indicator.dart';

const _strings = {
  'common': {'retry': 'Retry', 'cancel': 'Cancel', 'save': 'Save', 'confirm': 'OK', 'copied': 'c'},
  'err': {'generic': 'Something went wrong', 'serverError': 'Server error'},
  'chat': {
    'empty': 'No messages yet',
    'disabled': 'Chat is disabled',
    'awaitingKey': 'Waiting to be let in',
    'keyMismatch': 'Your chat key no longer matches',
    'undecryptable': '[cannot decrypt]',
    'unknownUser': 'Someone',
    'recoveryNeeded': 'Enter your recovery code',
    'recoveryCode': 'Recovery code',
    'recover': 'Unlock',
    'recoverFailed': 'Wrong recovery code.',
    'compose': 'Message',
    'send': 'Send',
    'report': 'Report message',
    'reported': 'Message reported',
    'sending': 'Sending…',
    'notSent': 'Not sent',
    'retry': 'Retry',
    'discard': 'Discard',
    'reply': {'button': 'Reply'},
    'thread': {'count': '{n} replies', 'reply': 'Reply in thread', 'empty': 'No replies'},
    'image': {'attach': 'Attach image'},
    'mention': {'title': 'Mention someone'},
    'edit': {'button': 'Edit'},
    'reset': {'button': 'Reset chat identity'},
    'moderation': {'done': 'Done'},
    'verify': {'logTampered': 'The log was altered', 'notInLogHint': 'Not in the log'},
    'typing': {
      'one': '{name} is typing…',
      'two': '{a} and {b} are typing…',
      'many': '{n} people are typing…',
    },
  },
  'dm': {'seen': 'Seen'},
  'moderation': {
    'title': 'Moderation',
    'empty': 'No reported messages',
    'reportCount': '{n} reports',
    'remove': 'Remove',
    'restore': 'Restore',
  },
  'kt': {
    'title': 'Key transparency',
    'verified': 'Key log verified',
    'broken': 'Key log FAILED verification',
    'entries': '{n} entries',
    'headHash': 'Head hash',
    'headMismatch': 'Head does not match',
    'tampered': 'The key log was rewritten',
    'safetyNumber': 'Your safety number',
    'safetyHint': 'Compare out of band',
    'peer': {'mismatch': 'Key substituted', 'absent': 'Key not in log'},
  },
  'twofa': {
    'title': '2FA',
    'hint': 'hint',
    'enable': 'Enable 2FA',
    'disable': 'Disable 2FA',
    'enabled': 'Two-factor is on',
    'disableBlurb': 'blurb',
    'scan': 'Scan this',
    'secret': 'Setup key',
    'code': '6-digit code',
    'verify': 'Verify',
    'done': 'Done',
    'failed': 'Something went wrong',
    'wrongCode': 'Invalid code.',
    'backupHintLong': 'Backup codes',
    'copyCodes': 'Copy codes',
  },
  'voice': {'call': 'Call', 'error': {'micDenied': 'Mic denied'}},
  'recovery': {
    'title': 'Chat backup',
    'hint': 'h',
    'generate': 'g',
    'saveWarning': 'w',
    'resetHint': 'rh',
    'reset': 'Reset identity',
    'resetConfirm': 'rc',
    'resetDone': 'rd',
  },
};

Widget _host(Widget child, List<Override> overrides) => ProviderScope(
      overrides: overrides,
      child: I18nScope(
        i18n: I18n(_strings, const {}, const Locale('en')),
        child: MaterialApp(home: child),
      ),
    );

class _FakeAuth extends AuthController {
  _FakeAuth(this.user);
  final AuthUser? user;
  @override
  Future<AuthUser?> build() async => user;
}

Override get _auth => authControllerProvider
    .overrideWith(() => _FakeAuth(const AuthUser(id: 'me', email: 'me@x.io')));

Override _authTwoFactor({required bool enabled}) => authControllerProvider.overrideWith(
      () => _FakeAuth(AuthUser(id: 'me', email: 'me@x.io', twoFactorEnabled: enabled)),
    );

/// Never reaches the network: `build` returns the given state and `recover`
/// always fails, which is the branch the gate has to render.
class _FakeIdentity extends ChatIdentityController {
  _FakeIdentity(this.value);
  final ChatIdentityState value;
  @override
  Future<ChatIdentityState> build() async => value;
  @override
  Future<void> recover(String code) async => throw StateError('bad code');
}

Override _identity({bool needsRecovery = false}) => chatIdentityProvider
    .overrideWith(() => _FakeIdentity(ChatIdentityState(needsRecovery: needsRecovery)));

Override _members(String leagueId, List<Map<String, dynamic>> members) =>
    leagueDetailProvider(leagueId).overrideWith((ref) async => LeagueDetailResponse.fromJson({
          'league': {
            'id': leagueId,
            'name': 'L',
            'visibility': 'PRIVATE',
            'mode': 'NORMAL',
            'role': 'MEMBER',
            'memberCount': members.length,
          },
          'members': members,
        }));

Map<String, dynamic> _member(String id, String name) => {
      'userId': id,
      'name': name,
      'role': 'MEMBER',
      'joinedAt': '2026-01-01T00:00:00.000Z',
    };

ChatLine _line(String id,
        {String? userId,
        String? text,
        String? at,
        String? authorName,
        Total? reactions,
        MineValue? myReaction}) =>
    ChatLine(
      id: id,
      userId: userId,
      text: text ?? 'body $id',
      createdAt: at ?? '2026-07-01T10:00:00.000Z',
      authorName: authorName,
      reactions: reactions,
      myReaction: myReaction,
    );

Total _totals({int fire = 0, int goal = 0, int wow = 0}) => Total(
      fire: fire.toDouble(),
      goal: goal.toDouble(),
      wow: wow.toDouble(),
      laugh: 0,
      sad: 0,
      angry: 0,
    );

OutboxEntry _pending(String id, String room, String text) =>
    OutboxEntry(localId: id, roomId: room, text: text, send: () async {});

/// The api surface is a set of extensions on [ApiClient], so a fake overrides
/// the transport underneath them rather than the (non-virtual) endpoint method.
class _ModApi extends ApiClient {
  _ModApi() : super(TokenStore());
  final calls = <String>[];
  bool fail = false;
  @override
  Future<Map<String, dynamic>> postJson(String path, {Object? body}) async {
    final b = body! as Map<String, dynamic>;
    calls.add('${b['messageId']}:${b['action']}');
    if (fail) throw ApiException(500, 'nope');
    return {'ok': true};
  }
}

class _TwoFactorApi extends ApiClient {
  _TwoFactorApi() : super(TokenStore());
  Map<String, dynamic> enableResponse = const {
    'totpURI': 'otpauth://totp/x?secret=SEKRIT',
    'backupCodes': ['aaa', 'bbb'],
  };
  bool totpValid = false;
  int disableCalls = 0;

  @override
  Future<Map<String, dynamic>> postJson(String path, {Object? body}) async {
    switch (path) {
      case '/api/auth/two-factor/enable':
        return enableResponse;
      case '/api/me/confirm-totp':
        return {'valid': totpValid};
      case '/api/auth/two-factor/disable':
        disableCalls++;
        return {'ok': true};
      default:
        return {'ok': true};
    }
  }
}

KtView _ktView({
  bool chainOk = true,
  bool headTampered = false,
  bool verificationOk = true,
  String? failure,
}) =>
    KtView(
      verification:
          KtVerification(ok: verificationOk, count: 3, head: 'abc', failure: failure),
      entryCount: 3,
      headHash: 'recomputed-head',
      chainOk: chainOk,
      headTampered: headTampered,
      entries: const [],
      mySafetyNumber: '12345 67890',
    );

void main() {
  group('chatItems', () {
    final lines = [_line('a'), _line('b')];
    final outbox = [_pending('p1', 'r', 'first'), _pending('p2', 'r', 'second')];

    test('forward order is delivered lines then pending, oldest first', () {
      final items = chatItems(lines, outbox);
      expect(items.map((e) => e is ChatLine ? e.id : (e as OutboxEntry).localId).toList(),
          ['a', 'b', 'p1', 'p2']);
    });

    test('reversed puts the newest pending entry at index 0', () {
      final items = chatItems(lines, outbox, reverse: true);
      expect(items.map((e) => e is ChatLine ? e.id : (e as OutboxEntry).localId).toList(),
          ['p2', 'p1', 'b', 'a']);
    });

    test('handles either side being empty', () {
      expect(chatItems(const [], const []), isEmpty);
      expect(chatItems(lines, const [], reverse: true).length, 2);
      expect(chatItems(const [], outbox).length, 2);
    });
  });

  group('mentionIdsIn', () {
    final members = [
      Member.fromJson(_member('u1', 'Alice')),
      Member.fromJson(_member('u2', 'Bob')),
    ];

    test('matches only the names actually written in the text', () {
      expect(mentionIdsIn('hey @Alice look', members), ['u1']);
      expect(mentionIdsIn('hey @Alice and @Bob', members), ['u1', 'u2']);
    });

    test('a deleted mention is not sent', () {
      expect(mentionIdsIn('hey look', members), isEmpty);
    });
  });

  group('lastSeenOwnMessage', () {
    final readAt = DateTime.parse('2026-07-01T12:00:00.000Z');

    test('null with no signed-in user', () {
      final view = DmRoomView(
          state: ChatState.ready, lines: [_line('a', userId: 'me')], otherReadAt: readAt);
      expect(lastSeenOwnMessage(view, null), isNull);
    });

    test('null when the peer has never read the thread', () {
      final view =
          DmRoomView(state: ChatState.ready, lines: [_line('a', userId: 'me')]);
      expect(lastSeenOwnMessage(view, 'me'), isNull);
    });

    test('skips an unparsable timestamp and other people messages', () {
      final view = DmRoomView(
        state: ChatState.ready,
        lines: [
          _line('a', userId: 'me', at: '2026-07-01T11:00:00.000Z'),
          _line('b', userId: 'me', at: 'not-a-date'),
          _line('c', userId: 'other', at: '2026-07-01T11:30:00.000Z'),
        ],
        otherReadAt: readAt,
      );
      expect(lastSeenOwnMessage(view, 'me'), 'a');
    });

    test('ignores own messages sent after the read mark', () {
      final view = DmRoomView(
        state: ChatState.ready,
        lines: [
          _line('a', userId: 'me', at: '2026-07-01T11:00:00.000Z'),
          _line('b', userId: 'me', at: '2026-07-01T13:00:00.000Z'),
        ],
        otherReadAt: readAt,
      );
      expect(lastSeenOwnMessage(view, 'me'), 'a');
    });
  });

  group('LeagueChatScreen chat states', () {
    Future<void> pumpState(WidgetTester tester, ChatState state,
        {List<ChatLine> lines = const []}) async {
      await tester.pumpWidget(_host(
        const LeagueChatScreen(leagueId: 'l1', name: 'League'),
        [
          _auth,
          _identity(),
          _members('l1', [_member('me', 'Me')]),
          leagueChatProvider('l1')
              .overrideWith((ref) async => LeagueChatView(state: state, lines: lines)),
        ],
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('disabled', (tester) async {
      await pumpState(tester, ChatState.disabled);
      expect(find.text('Chat is disabled'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('awaitingKey', (tester) async {
      await pumpState(tester, ChatState.awaitingKey);
      expect(find.text('Waiting to be let in'), findsOneWidget);
    });

    testWidgets('needsIdentity spins', (tester) async {
      await tester.pumpWidget(_host(
        const LeagueChatScreen(leagueId: 'l1', name: 'League'),
        [
          _auth,
          _identity(),
          _members('l1', const []),
          leagueChatProvider('l1')
              .overrideWith((ref) async => const LeagueChatView(state: ChatState.needsIdentity)),
        ],
      ));
      await tester.pump();
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsWidgets);
    });

    testWidgets('keyMismatch alarms and offers recovery plus a reset', (tester) async {
      await pumpState(tester, ChatState.keyMismatch);
      expect(find.text('Your chat key no longer matches'), findsOneWidget);
      expect(find.text('Unlock'), findsOneWidget);
      expect(find.text('Reset chat identity'), findsOneWidget);
      // Must not read like an ordinary empty room.
      expect(find.text('No messages yet'), findsNothing);
    });

    testWidgets('ready and empty', (tester) async {
      await pumpState(tester, ChatState.ready);
      expect(find.text('No messages yet'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('ready with lines shows author and body', (tester) async {
      await pumpState(tester, ChatState.ready,
          lines: [_line('m1', userId: 'me', text: 'hello there')]);
      expect(find.text('hello there'), findsOneWidget);
      expect(find.text('Me'), findsOneWidget);
      expect(find.text('2026-07-01T10:00:00.000Z'), findsNothing);
    });

    testWidgets('an ex-member is still named from the server metadata',
        (tester) async {
      // 'gone' is not in the roster override, so only the message's own
      // authorName can name them.
      await pumpState(tester, ChatState.ready,
          lines: [_line('m1', userId: 'gone', text: 'bye', authorName: 'Departed')]);
      expect(find.text('Departed'), findsOneWidget);
      expect(find.text('Someone'), findsNothing);
    });

    testWidgets('a message with no author metadata at all falls back', (tester) async {
      await pumpState(tester, ChatState.ready, lines: [_line('m1', userId: 'gone')]);
      expect(find.text('Someone'), findsOneWidget);
    });

    testWidgets('reaction totals render as chips, zero counts omitted',
        (tester) async {
      await pumpState(tester, ChatState.ready, lines: [
        _line('m1', userId: 'me', reactions: _totals(fire: 2, goal: 1), myReaction: MineValue.fire),
      ]);
      expect(find.text('🔥 2'), findsOneWidget);
      expect(find.text('⚽ 1'), findsOneWidget);
      expect(find.textContaining('😮'), findsNothing);
    });

    testWidgets('a message nobody reacted to renders no chips', (tester) async {
      await pumpState(tester, ChatState.ready,
          lines: [_line('m1', userId: 'me', reactions: _totals())]);
      expect(find.textContaining('🔥'), findsNothing);
    });
  });

  group('DmRoomScreen chat states', () {
    Future<void> pump(WidgetTester tester, DmRoomView view) async {
      await tester.pumpWidget(_host(
        const DmRoomScreen(threadId: 't1', title: 'Alice'),
        [
          _auth,
          _identity(),
          dmRoomProvider('t1').overrideWith((ref) async => view),
          dmThreadsProvider.overrideWith((ref) async => DmThreadsResponse.fromJson(
                const {'threads': <Map<String, dynamic>>[]},
              )),
        ],
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('keyMismatch alarms instead of showing an empty room', (tester) async {
      await pump(tester, const DmRoomView(state: ChatState.keyMismatch));
      expect(find.text('Your chat key no longer matches'), findsOneWidget);
      expect(find.text('No messages yet'), findsNothing);
    });

    testWidgets('ready renders lines and the Seen marker', (tester) async {
      await pump(
        tester,
        DmRoomView(
          state: ChatState.ready,
          lines: [_line('a', userId: 'me', text: 'yo', at: '2026-07-01T10:00:00.000Z')],
          otherReadAt: DateTime.parse('2026-07-01T12:00:00.000Z'),
        ),
      );
      expect(find.text('yo'), findsOneWidget);
      expect(find.text('Seen'), findsOneWidget);
    });

    testWidgets('a substituted peer key is badged', (tester) async {
      await pump(tester,
          const DmRoomView(state: ChatState.ready, otherKeyCheck: KtCheck.mismatch));
      expect(find.text('Key substituted'), findsOneWidget);
    });

    testWidgets('an ok peer key shows no badge', (tester) async {
      await pump(
          tester, const DmRoomView(state: ChatState.ready, otherKeyCheck: KtCheck.ok));
      expect(find.text('Key substituted'), findsNothing);
      expect(find.text('Key not in log'), findsNothing);
    });
  });

  testWidgets('KtKeyBadge renders absent as a caution and unknown as nothing',
      (tester) async {
    await tester.pumpWidget(_host(
      const Scaffold(
        body: Column(children: [
          KtKeyBadge(check: KtCheck.absent),
          KtKeyBadge(check: KtCheck.unknown),
        ]),
      ),
      const [],
    ));
    await tester.pump();
    expect(find.text('Key not in log'), findsOneWidget);
    expect(find.text('Key substituted'), findsNothing);
  });

  testWidgets('the recovery gate surfaces a wrong code', (tester) async {
    await tester.pumpWidget(_host(
      const LeagueChatScreen(leagueId: 'l1', name: 'League'),
      [_auth, _identity(needsRecovery: true)],
    ));
    await tester.pumpAndSettle();
    expect(find.text('Enter your recovery code'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'nope');
    await tester.tap(find.text('Unlock'));
    await tester.pumpAndSettle();
    expect(find.text('Wrong recovery code.'), findsOneWidget);
  });

  group('TypingIndicator', () {
    Future<void> pump(WidgetTester tester, Map<String, DateTime> typing) async {
      await tester.pumpWidget(_host(
        const Scaffold(body: TypingIndicator(leagueId: 'l1')),
        [
          _auth,
          _members('l1', [_member('u1', 'Alice'), _member('u2', 'Bob')]),
          typingProvider.overrideWith((ref) => typing),
        ],
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('names one typist and ignores my own frames', (tester) async {
      final now = DateTime.now();
      await pump(tester, {'l1|u1': now, 'l1|me': now});
      expect(find.text('Alice is typing…'), findsOneWidget);
    });

    testWidgets('ignores other leagues and counts three or more', (tester) async {
      final now = DateTime.now();
      await pump(tester, {
        'l1|u1': now,
        'l1|u2': now,
        'l1|u3': now,
        'l2|u9': now,
      });
      expect(find.text('3 people are typing…'), findsOneWidget);
    });

    testWidgets('a stale frame renders nothing', (tester) async {
      await pump(tester, {'l1|u1': DateTime.now().subtract(const Duration(seconds: 30))});
      expect(find.text('Alice is typing…'), findsNothing);
    });
  });

  group('ModerationScreen', () {
    testWidgets('empty state', (tester) async {
      await tester.pumpWidget(_host(
        const ModerationScreen(leagueId: 'l1'),
        [moderationReportsProvider('l1').overrideWith((ref) async => const [])],
      ));
      await tester.pumpAndSettle();
      expect(find.text('No reported messages'), findsOneWidget);
    });

    testWidgets('a REMOVED report offers restore, anything else offers remove',
        (tester) async {
      final api = _ModApi();
      await tester.pumpWidget(_host(
        const ModerationScreen(leagueId: 'l1'),
        [
          apiProvider.overrideWithValue(api),
          moderationReportsProvider('l1').overrideWith((ref) async => const [
                ModerationReport(
                    messageId: 'm1',
                    text: 'gone',
                    reports: 2,
                    moderation: ModerationValue.removed,
                    createdAt: '2026-07-01T10:00:00.000Z'),
                ModerationReport(
                    messageId: 'm2',
                    text: 'here',
                    reports: 1,
                    moderation: ModerationValue.visible,
                    createdAt: '2026-07-01T10:00:00.000Z'),
              ]),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Restore'), findsOneWidget);
      expect(find.text('Remove'), findsOneWidget);

      await tester.tap(find.text('Restore'));
      await tester.pumpAndSettle();
      expect(api.calls, ['m1:restore']);
      expect(find.text('Done'), findsOneWidget);
    });

    testWidgets('a failed action is surfaced, not swallowed', (tester) async {
      final api = _ModApi()..fail = true;
      await tester.pumpWidget(_host(
        const ModerationScreen(leagueId: 'l1'),
        [
          apiProvider.overrideWithValue(api),
          moderationReportsProvider('l1').overrideWith((ref) async => const [
                ModerationReport(
                    messageId: 'm2',
                    text: 'here',
                    reports: 1,
                    moderation: ModerationValue.visible,
                    createdAt: '2026-07-01T10:00:00.000Z'),
              ]),
        ],
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(find.text('Done'), findsNothing);
      expect(find.byType(SnackBar), findsOneWidget);
    });
  });

  group('TwoFactorScreen', () {
    testWidgets('idle -> verify -> backup', (tester) async {
      final api = _TwoFactorApi();
      await tester.pumpWidget(_host(
        const TwoFactorScreen(),
        [_authTwoFactor(enabled: false), apiProvider.overrideWithValue(api)],
      ));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'pw');
      await tester.tap(find.text('Enable 2FA'));
      await tester.pumpAndSettle();
      expect(find.text('SEKRIT'), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, '123456');
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();
      expect(find.text('aaa\nbbb'), findsOneWidget);
    });

    testWidgets('a missing totpURI fails instead of showing an empty secret',
        (tester) async {
      final api = _TwoFactorApi()..enableResponse = const {'backupCodes': <String>[]};
      await tester.pumpWidget(_host(
        const TwoFactorScreen(),
        [_authTwoFactor(enabled: false), apiProvider.overrideWithValue(api)],
      ));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'pw');
      await tester.tap(find.text('Enable 2FA'));
      await tester.pumpAndSettle();
      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Setup key'), findsNothing);
    });

    testWidgets('disable with a wrong code never calls disable', (tester) async {
      final api = _TwoFactorApi()..totpValid = false;
      await tester.pumpWidget(_host(
        const TwoFactorScreen(),
        [_authTwoFactor(enabled: true), apiProvider.overrideWithValue(api)],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Two-factor is on'), findsOneWidget);
      await tester.enterText(find.byType(TextField).last, '000000');
      await tester.tap(find.text('Disable 2FA'));
      await tester.pumpAndSettle();
      expect(find.text('Invalid code.'), findsOneWidget);
      expect(api.disableCalls, 0);
    });
  });

  group('KtScreen', () {
    testWidgets('a self-consistent chain under a wrong head is NOT verified',
        (tester) async {
      await tester.pumpWidget(_host(
        const KtScreen(),
        [ktProvider.overrideWith((ref) async => _ktView(chainOk: false))],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Key log FAILED verification'), findsOneWidget);
      expect(find.text('Head does not match'), findsOneWidget);
      expect(find.text('recomputed-head'), findsOneWidget);
    });

    testWidgets('an append-only violation gets its own loud warning', (tester) async {
      await tester.pumpWidget(_host(
        const KtScreen(),
        [
          ktProvider.overrideWith(
              (ref) async => _ktView(chainOk: false, verificationOk: false, headTampered: true)),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.text('The key log was rewritten'), findsOneWidget);
      expect(find.text('The log was altered'), findsOneWidget);
    });

    testWidgets('a verified chain badges green with the entry count', (tester) async {
      await tester.pumpWidget(_host(
        const KtScreen(),
        [ktProvider.overrideWith((ref) async => _ktView())],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Key log verified'), findsOneWidget);
      expect(find.text('3 entries'), findsOneWidget);
      expect(find.text('The key log was rewritten'), findsNothing);
    });
  });
}
