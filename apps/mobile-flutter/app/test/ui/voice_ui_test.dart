import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/widgets/call_line_tile.dart';
import 'package:nostragoalus/ui/widgets/voice_actions.dart';
import 'package:nostragoalus/ui/widgets/voice_bar.dart';
import 'package:nostragoalus/voice/voice_service.dart';

import '../api/helpers.dart';

const _strings = {
  'voice': {
    'call': 'Call',
    'joinVoice': 'Join voice',
    'connecting': 'Connecting',
    'ringing': 'Ringing',
    'inCall': '{n} in voice',
    'mute': 'Mute',
    'unmute': 'Unmute',
    'hangup': 'Hang up',
    'error': {'micDenied': 'Microphone access denied'},
    'log': {
      'ongoing': '{name} started a call',
      'ended': 'Call by {name} · {duration}',
      'missed': 'Missed call from {name}',
    },
  },
  'chat': {'unknownUser': 'Someone'},
  'err': {'generic': 'Something went wrong', 'serverError': 'Server error'},
};

/// A VoiceService whose entry points are recorded instead of opening a mesh.
class _FakeVoice extends VoiceService {
  _FakeVoice({this.fail})
      : super(
          ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = FakeAdapter([])),
          TokenStore(InMemoryKv()),
          'me',
        );

  final Object? fail;
  final List<String> actions = [];

  @override
  Future<void> join(VoiceScope scope) async {
    actions.add('join:${scope.threadId ?? scope.leagueId}');
    if (fail != null) throw fail!;
  }

  @override
  Future<void> invite(VoiceScope scope, List<String> userIds) async {
    actions.add('invite:${scope.threadId ?? scope.leagueId}:${userIds.join(",")}');
    if (fail != null) throw fail!;
  }
}

Widget _host(Widget child, VoiceService voice) => ProviderScope(
      overrides: [voiceServiceProvider.overrideWithValue(voice)],
      child: I18nScope(
        i18n: I18n(_strings, const {}, const Locale('en')),
        child: MaterialApp(home: Scaffold(body: child)),
      ),
    );

Call _call(CallStatusValue status, {String? name = 'Ana', String? endedAt}) => Call(
      id: 'c1',
      status: status,
      initiatorId: 'u1',
      initiatorName: name,
      participantCount: 2,
      startedAt: '2026-07-21T10:00:00.000Z',
      endedAt: endedAt,
    );

void main() {
  group('CallLineTile', () {
    testWidgets('an ended call names who called and how long it ran', (tester) async {
      await tester.pumpWidget(_host(
        CallLineTile(call: _call(CallStatusValue.ended, endedAt: '2026-07-21T10:02:30.000Z')),
        _FakeVoice(),
      ));
      expect(find.text('Call by Ana · 2:30'), findsOneWidget);
    });

    // The point of the feature: a miss has to be legible as a miss, not as one
    // more quiet grey line you scroll past.
    testWidgets('a missed call is red and carries the missed-call glyph', (tester) async {
      await tester.pumpWidget(_host(CallLineTile(call: _call(CallStatusValue.missed)), _FakeVoice()));
      expect(find.text('Missed call from Ana'), findsOneWidget);
      final context = tester.element(find.byType(CallLineTile));
      final error = Theme.of(context).colorScheme.error;
      expect(tester.widget<Icon>(find.byIcon(Icons.call_missed)).color, error);
      expect(tester.widget<Text>(find.text('Missed call from Ana')).style?.color, error);
    });

    testWidgets('an initiator with no name falls back to the localized stand-in',
        (tester) async {
      await tester.pumpWidget(
          _host(CallLineTile(call: _call(CallStatusValue.ongoing, name: null)), _FakeVoice()));
      expect(find.text('Someone started a call'), findsOneWidget);
    });

    // A status this build does not know must render nothing rather than an
    // invented sentence: the widget has to honour the null, not just receive it.
    testWidgets('a status this build does not know renders nothing', (tester) async {
      await tester.pumpWidget(
          _host(CallLineTile(call: _call(CallStatusValue.unknown)), _FakeVoice()));
      expect(find.byType(Icon), findsNothing);
      expect(find.byType(Text), findsNothing);
    });
  });

  group('VoiceCallButton', () {
    const scope = VoiceScope.league('l1');

    testWidgets('a league room joins quietly, ringing nobody', (tester) async {
      final voice = _FakeVoice();
      await tester.pumpWidget(_host(const VoiceCallButton(scope: scope), voice));
      await tester.tap(find.byIcon(Icons.call_outlined));
      await tester.pumpAndSettle();
      expect(voice.actions, ['join:l1']);
    });

    testWidgets('a DM rings the other party', (tester) async {
      final voice = _FakeVoice();
      await tester.pumpWidget(_host(
          const VoiceCallButton(scope: VoiceScope.dm('t1'), ring: ['them']), voice));
      await tester.tap(find.byIcon(Icons.call_outlined));
      await tester.pumpAndSettle();
      expect(voice.actions, ['invite:t1:them']);
    });

    // The in-call bar takes over at the bottom of the same screen; leaving both
    // up is the pair of competing call controls this replaced.
    testWidgets('hides while this room call is running', (tester) async {
      final voice = _FakeVoice();
      await tester.pumpWidget(_host(const VoiceCallButton(scope: scope), voice));
      voice.state.value = const VoiceConnecting(scope);
      await tester.pump();
      expect(find.byIcon(Icons.call_outlined), findsNothing);
    });

    testWidgets('stays up for another room call', (tester) async {
      final voice = _FakeVoice();
      await tester.pumpWidget(_host(const VoiceCallButton(scope: scope), voice));
      voice.state.value = const VoiceConnecting(VoiceScope.dm('t1'));
      await tester.pump();
      expect(find.byIcon(Icons.call_outlined), findsOneWidget);
    });

    testWidgets('a denied microphone is reported as something the user can fix',
        (tester) async {
      final voice = _FakeVoice(fail: const VoiceJoinException(true, 'denied'));
      await tester.pumpWidget(_host(const VoiceCallButton(scope: scope), voice));
      await tester.tap(find.byIcon(Icons.call_outlined));
      await tester.pump();
      expect(find.text('Microphone access denied'), findsOneWidget);
    });

    testWidgets('a join that failed for another reason says so, not the mic',
        (tester) async {
      final voice = _FakeVoice(fail: const VoiceJoinException(false, 'no ice'));
      await tester.pumpWidget(_host(const VoiceCallButton(scope: scope), voice));
      await tester.tap(find.byIcon(Icons.call_outlined));
      await tester.pump();
      expect(find.text('Server error'), findsOneWidget);
    });

    testWidgets('any other failure still reports rather than dying silently',
        (tester) async {
      final voice = _FakeVoice(fail: StateError('no socket'));
      await tester.pumpWidget(_host(const VoiceCallButton(scope: scope), voice));
      await tester.tap(find.byIcon(Icons.call_outlined));
      await tester.pump();
      expect(find.text('Something went wrong'), findsOneWidget);
    });
  });

  group('VoiceBar', () {
    const scope = VoiceScope.league('l1');

    // It used to stand there permanently offering to join, which in a DM put a
    // second call button on a screen that already had one.
    testWidgets('shows nothing when no call is up', (tester) async {
      await tester.pumpWidget(_host(const VoiceBar(scope: scope), _FakeVoice()));
      expect(find.byIcon(Icons.call_end), findsNothing);
    });

    testWidgets('shows nothing for a call in another room', (tester) async {
      final voice = _FakeVoice();
      await tester.pumpWidget(_host(const VoiceBar(scope: scope), voice));
      voice.state.value = const VoiceConnecting(VoiceScope.dm('t1'));
      await tester.pump();
      expect(find.byIcon(Icons.call_end), findsNothing);
    });

    testWidgets('shows the controls once this room call is up', (tester) async {
      final voice = _FakeVoice();
      await tester.pumpWidget(_host(const VoiceBar(scope: scope), voice));
      voice.state.value = const VoiceConnecting(scope);
      await tester.pump();
      expect(find.byIcon(Icons.call_end), findsOneWidget);
      expect(find.text('Connecting'), findsOneWidget);
    });
  });
}
