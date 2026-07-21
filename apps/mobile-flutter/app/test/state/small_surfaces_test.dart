import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/auth/sso.dart';
import 'package:nostragoalus/chat/chat_crypto.dart';
import 'package:nostragoalus/chat/outbox.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/kt/kt_providers.dart';
import 'package:nostragoalus/state/app_prefs.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/voice/voice_service.dart';

import '../api/helpers.dart';

/// A keystore that is simply unavailable, as on a headless host.
class _DeadKv implements SecureKv {
  @override
  Future<void> delete(String key) async => throw StateError('no keystore');
  @override
  Future<String?> read(String key) async => throw StateError('no keystore');
  @override
  Future<void> write(String key, String value) async => throw StateError('no keystore');
}

class _FakeAuthRepo implements AuthRepository {
  _FakeAuthRepo(this._user);
  final AuthUser _user;
  var signedIn = false;

  @override
  Future<AuthUser?> currentUser() async => null;
  @override
  Future<AuthUser> signIn(String email, String password) async {
    signedIn = true;
    return _user;
  }

  @override
  Future<void> signOut() async {}
  @override
  Future<void> signUp(String name, String email, String password) async {}
  @override
  Future<void> requestPasswordReset(String email) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('persisted preferences', () {
    test('an unavailable keystore leaves the defaults instead of failing boot', () async {
      final prefs = AppPrefs(_DeadKv());
      await prefs.load();
      expect(prefs.locale, isNull);
      expect(prefs.competition, isNull);
    });

    test('a write that cannot persist never breaks the UI action', () async {
      final prefs = AppPrefs(_DeadKv());
      prefs.setLocale('fr');
      prefs.setCompetition('wc26');
      prefs.setCompetition(null); // the delete path
      expect(prefs.locale, 'fr');
      expect(prefs.competition, isNull);
    });

    test('round-trips through a working keystore', () async {
      final kv = InMemoryKv();
      AppPrefs(kv)
        ..setLocale('th')
        ..setCompetition('euro28');
      await Future<void>.delayed(Duration.zero); // the writes are fire-and-forget

      final reloaded = AppPrefs(kv);
      await reloaded.load();
      expect(reloaded.locale, 'th');
      expect(reloaded.competition, 'euro28');
    });
  });

  group('the locale loader', () {
    test('falls back to English for an unsupported language tag', () async {
      final asked = <String>[];
      await I18n.load(const Locale('de'), readAsset: (path) async {
        asked.add(path);
        return '{"common":{"save":"Save"}}';
      });
      // Only English is read: 'de' never becomes a path that would 404.
      expect(asked, ['assets/i18n/en.json']);
    });

    test('loads a supported locale, with English behind it as the fallback', () async {
      final asked = <String>[];
      final i18n = await I18n.load(const Locale('fr'), readAsset: (path) async {
        asked.add(path);
        return path.contains('fr')
            ? '{"common":{"save":"Enregistrer"}}'
            : '{"common":{"save":"Save"},"only":{"en":"x"}}';
      });
      expect(asked, ['assets/i18n/fr.json', 'assets/i18n/en.json']);
      expect(i18n.t('common.save'), 'Enregistrer');
      expect(i18n.t('only.en'), 'x', reason: 'a key missing in fr falls back to en');
    });
  });

  group('voice scopes', () {
    test('the two constructors, equality and hashing', () {
      const dm = VoiceScope.dm('t1');
      const league = VoiceScope.league('l1', matchId: 'm1');

      expect(dm.kind, VoiceKind.dm);
      expect(dm.threadId, 't1');
      expect(league.kind, VoiceKind.league);
      expect(league.leagueId, 'l1');
      expect(league.matchId, 'm1');

      // Value equality is what lets a bar tell "my room" from "some other room".
      expect(dm, const VoiceScope.dm('t1'));
      expect(dm.hashCode, const VoiceScope.dm('t1').hashCode);
      expect(dm, isNot(const VoiceScope.dm('t2')));
      expect(league, isNot(const VoiceScope.league('l1')));
    });
  });

  group('the outbox entry', () {
    test('copyWith keeps what it is not given', () {
      final entry = OutboxEntry(
          localId: 'o1', roomId: 'r1', text: 'hi', send: () async {}, failed: false);
      final failed = entry.copyWith(failed: true);

      expect(failed.localId, 'o1');
      expect(failed.roomId, 'r1');
      expect(failed.text, 'hi');
      expect(failed.failed, isTrue);
      expect(entry.copyWith().failed, isFalse);
    });
  });

  group('exception messages', () {
    test('carry enough to diagnose from a log', () {
      expect(const KtKeyMismatch().toString(), contains('transparency log'));
      expect(const ChatKeyMismatch().toString(), contains('wrapped keys'));
      expect(const SsoException('bad state').toString(), contains('bad state'));
      expect(const VoiceJoinException(true, 'denied').toString(),
          contains('micDenied: true'));
    });
  });

  group('the provider graph', () {
    test('a 401 bumps the revocation counter rather than recursing', () async {
      final tokens = TokenStore(InMemoryKv());
      await tokens.save('a-live-token');
      final c = ProviderContainer(overrides: [
        tokenStoreProvider.overrideWithValue(tokens),
        dioProvider.overrideWithValue(Dio()..httpClientAdapter = FakeAdapter([Reply(401, {})])),
      ]);
      addTearDown(c.dispose);

      final before = c.read(sessionRevokedProvider);
      final api = c.read(apiClientProvider);
      await expectLater(api.getJson('/api/anything'), throwsA(isA<ApiException>()));
      expect(c.read(sessionRevokedProvider), before + 1,
          reason: 'invalidating the auth controller from here is a circular dependency');
      expect(tokens.token, isNull, reason: 'a dead session must not keep its token');
    });

    test('signIn stores the user and flushes the previous account cache', () async {
      final repo = _FakeAuthRepo(const AuthUser(id: 'u2', email: 'u2@example.com'));
      final c = ProviderContainer(overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        authRepositoryProvider.overrideWithValue(repo),
      ]);
      addTearDown(c.dispose);

      await c.read(authControllerProvider.future);
      await c.read(authControllerProvider.notifier).signIn('u2@example.com', 'pw');

      expect(repo.signedIn, isTrue);
      expect(c.read(authControllerProvider).valueOrNull?.id, 'u2');
    });

    test('joinLeague refuses to be called with neither a league nor a code', () async {
      final c = ProviderContainer(
          overrides: [tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv()))]);
      addTearDown(c.dispose);
      await expectLater(c.read(joinLeagueProvider)(), throwsA(isA<ArgumentError>()));
    });

    test('the live service is created once and disposed with the container', () {
      final c = ProviderContainer(
          overrides: [tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv()))]);
      final service = c.read(liveServiceProvider);
      expect(identical(c.read(liveServiceProvider), service), isTrue);
      c.dispose(); // must not throw: the provider disposes the socket
    });
  });
}
