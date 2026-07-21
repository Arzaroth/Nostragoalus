import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('identity and escrow', () {
    test('chatIdentity tolerates an account with no keypair yet', () async {
      final (api, adapter) = buildApi([Reply(200, const {'identity': null})]);

      expect((await api.chatIdentity()).identity, isNull);
      expectRequest(adapter, method: 'GET', path: '/api/chat/identity');
    });

    test('chatIdentity parses the published key', () async {
      final (api, _) = buildApi([
        Reply(200, const {
          'identity': {'publicKey': 'PK', 'hasRecovery': true},
        }),
      ]);

      final res = await api.chatIdentity();
      expect(res.identity!.publicKey, 'PK');
      expect(res.identity!.hasRecovery, isTrue);
    });

    test('registerIdentity puts the public key', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'publicKey': 'PK', 'created': true}),
      ]);

      await api.registerIdentity('PK');

      expectRequest(adapter,
          method: 'PUT', path: '/api/chat/identity', body: {'publicKey': 'PK'});
    });

    test('resetChatIdentity posts the fresh key to the reset route', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.resetChatIdentity('PK2');

      expectRequest(adapter,
          method: 'POST', path: '/api/chat/identity/reset', body: {'publicKey': 'PK2'});
    });

    test('chatRecoveryBlob is null when nothing is escrowed', () async {
      final (api, adapter) = buildApi([Reply(200, const {'blob': null})]);

      expect(await api.chatRecoveryBlob(), isNull);
      expectRequest(adapter, method: 'GET', path: '/api/chat/recovery');
    });

    test('chatRecoveryBlob returns the escrow ciphertext', () async {
      final (api, _) = buildApi([Reply(200, const {'blob': 'BLOB'})]);
      expect(await api.chatRecoveryBlob(), 'BLOB');
    });

    test('setChatRecovery puts the blob', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setChatRecovery('BLOB');

      expectRequest(adapter,
          method: 'PUT', path: '/api/chat/recovery', body: {'blob': 'BLOB'});
    });

    test('chatIdentity throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.chatIdentity(), throwsStatus(500));
    });

    test('registerIdentity surfaces a failure', () async {
      final (api, _) = buildFailing(422);
      await expectLater(api.registerIdentity('PK'), throwsStatus(422));
    });

    test('resetChatIdentity surfaces a missing identity', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.resetChatIdentity('PK'), throwsStatus(404));
    });

    test('chatRecoveryBlob throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.chatRecoveryBlob(), throwsStatus(500));
    });

    test('setChatRecovery surfaces a missing identity', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.setChatRecovery('BLOB'), throwsStatus(404));
    });

    test('keysLog reads the transparency log raw', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'entries': []}),
      ]);

      expect(await api.keysLog(), {'entries': []});
      expectRequest(adapter, method: 'GET', path: '/api/keys/log');
    });

    test('keysLog throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.keysLog(), throwsStatus(500));
    });
  });

  group('room state and keys', () {
    test('chatStatus parses the epoch, role and key sets', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'enabled': true,
          'epoch': 2,
          'role': 'OWNER',
          'myWrappedKeys': [
            {'epoch': 2, 'wrappedKey': 'WK'},
          ],
          'missingKeys': [
            {'userId': 'u2', 'publicKey': 'PK2', 'name': 'Other'},
          ],
          'memberKeys': [],
          'rekeyPending': false,
        }),
      ]);

      final res = await api.chatStatus('lg');
      expect(res.epoch, 2);
      expect(res.role, 'OWNER');
      expect(res.missingKeys.single.userId, 'u2');
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/chat');
    });

    test('requestChatKey posts to the request-key route', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.requestChatKey('lg');

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/chat/request-key');
    });

    test('sealChatKeys posts the epoch and the wraps', () async {
      final (api, adapter) = buildApi([Reply(200, const {'added': 1})]);

      await api.sealChatKeys('lg', 2, const [
        {'userId': 'u2', 'wrappedKey': 'WK'},
      ]);

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/chat/keys', body: {
        'epoch': 2,
        'wraps': [
          {'userId': 'u2', 'wrappedKey': 'WK'},
        ],
      });
    });

    test('chatStatus throws rather than reporting chat disabled', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.chatStatus('lg'), throwsStatus(403));
    });

    test('requestChatKey surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.requestChatKey('lg'), throwsStatus(403));
    });

    test('sealChatKeys surfaces the stale-epoch conflict', () async {
      final (api, _) = buildFailing(409);
      await expectLater(api.sealChatKeys('lg', 1, const []), throwsStatus(409));
    });
  });

  group('messages', () {
    test('chatMessages sends the thread filter when given', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'messages': [], 'readMarker': null}),
      ]);

      await api.chatMessages('lg', thread: 'root1');

      expectRequest(adapter,
          method: 'GET',
          path: '/api/leagues/lg/chat/messages',
          query: {'thread': 'root1'});
    });

    test('chatMessages omits the thread filter for the main room', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'messages': [], 'readMarker': 'm9'}),
      ]);

      final res = await api.chatMessages('lg');
      expect(res.readMarker, 'm9');
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/chat/messages');
    });

    test('sendChat drops empty mention and image lists', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.sendChat('lg', 'cipher', 3,
          matchId: 'mt', mentions: const [], images: const []);

      expectRequest(adapter,
          method: 'POST',
          path: '/api/leagues/lg/chat/messages',
          body: {'ciphertext': 'cipher', 'epoch': 3, 'matchId': 'mt'});
    });

    test('sendChat carries the thread root, mentions and images', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.sendChat('lg', 'cipher', 3,
          threadId: 'root1',
          mentions: const ['u2'],
          images: const [
            {'ciphertext': 'IMG', 'byteSize': 12},
          ]);

      expectRequest(adapter,
          method: 'POST',
          path: '/api/leagues/lg/chat/messages',
          body: {
            'ciphertext': 'cipher',
            'epoch': 3,
            'threadId': 'root1',
            'mentions': ['u2'],
            'images': [
              {'ciphertext': 'IMG', 'byteSize': 12},
            ],
          });
    });

    test('chatAttachment sends the image index as a query', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'ciphertext': 'AAA', 'epoch': 2}),
      ]);

      final att = await api.chatAttachment('lg', 'm1', 3);
      expect(att.ciphertext, 'AAA');
      expect(att.epoch.toInt(), 2);
      expectRequest(adapter,
          method: 'GET',
          path: '/api/leagues/lg/chat/attachments/m1',
          query: {'idx': '3'});
    });

    test('editChatMessage posts the new ciphertext', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'editedAt': '2026-01-01T00:00:00.000Z', 'attachments': []}),
      ]);

      await api.editChatMessage('lg', 'm1', 'cipher2');

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/chat/edit', body: {
        'messageId': 'm1',
        'ciphertext': 'cipher2',
      });
    });

    test('reactChatMessage puts the emoji on the message', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.reactChatMessage('lg', 'm1', 'FIRE');

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/leagues/lg/chat/react',
          body: {'messageId': 'm1', 'emoji': 'FIRE'});
    });

    test('chatMessages throws rather than showing an empty room', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.chatMessages('lg'), throwsStatus(403));
    });

    test('sendChat surfaces a rejected send', () async {
      final (api, _) = buildFailing(422);
      await expectLater(api.sendChat('lg', 'c', 1), throwsStatus(422));
    });

    test('chatAttachment surfaces a failure', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.chatAttachment('lg', 'm1', 0), throwsStatus(404));
    });

    test('editChatMessage surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.editChatMessage('lg', 'm1', 'c'), throwsStatus(403));
    });

    test('reactChatMessage surfaces a failure', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.reactChatMessage('lg', 'm1', 'FIRE'), throwsStatus(404));
    });
  });

  group('moderation', () {
    test('chatReports unwraps the queue', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'reports': [
            {
              'id': 'm1',
              'userId': 'u2',
              'authorName': 'Other',
              'authorImage': null,
              'matchId': null,
              'epoch': 2,
              'ciphertext': 'AAA',
              'moderation': 'PENDING',
              'reports': 3,
              'createdAt': '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ]);

      final reports = await api.chatReports('lg');
      expect(reports.single.id, 'm1');
      expect(reports.single.reports, 3);
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/chat/reports');
    });

    test('moderateChatMessage posts the action', () async {
      final (api, adapter) = buildApi([Reply(200, const {'state': 'REMOVED'})]);

      await api.moderateChatMessage('lg', 'm1', 'remove');

      expectRequest(adapter,
          method: 'POST',
          path: '/api/leagues/lg/chat/moderate',
          body: {'messageId': 'm1', 'action': 'remove'});
    });

    test('reportChatMessage flags the message', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'state': 'PENDING', 'reports': 1}),
      ]);

      await api.reportChatMessage('lg', 'm1');

      expectRequest(adapter,
          method: 'POST',
          path: '/api/leagues/lg/chat/report',
          body: {'messageId': 'm1', 'reported': true});
    });

    test('chatReports throws on a non-2xx', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.chatReports('lg'), throwsStatus(403));
    });

    test('moderateChatMessage surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.moderateChatMessage('lg', 'm1', 'remove'), throwsStatus(403));
    });

    test('reportChatMessage surfaces a failure', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.reportChatMessage('lg', 'm1'), throwsStatus(404));
    });
  });
}
