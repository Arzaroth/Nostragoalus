import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { migrateBlobsToStorage } from '../../utils/storage/migrate'
import { useStorageDriver } from '../../utils/storage'

// Manual-only (admin Background tasks page): move the image blobs that still live
// in Postgres - chat attachment ciphertext and data: avatars - into the configured
// storage backend. Idempotent and resumable; run it until both counts reach 0
// before the release that drops the legacy columns.
export default defineTask({
  meta: { name: 'media:migrate-blobs', description: 'Move DB image blobs (avatars, chat images) into object storage' },
  async run() {
    return recordTaskRun(db, 'media:migrate-blobs', () => migrateBlobsToStorage(db, useStorageDriver()))
  },
})
