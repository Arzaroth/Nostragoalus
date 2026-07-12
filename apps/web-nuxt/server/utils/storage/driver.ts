// The storage backend abstraction: a tiny blob store keyed by string, used to
// keep image payloads (avatars, encrypted chat images) out of Postgres. Concrete
// drivers live in ./drivers; pick one with ./factory. The high-level, key-deriving
// operations are in ./service - this file is only the contract.

export interface StorageObject {
  bytes: Uint8Array
  contentType: string
}

export interface StorageDriver {
  // Write (or overwrite) the object at key. contentType is stored where the backend
  // supports it (S3 metadata); the fs driver derives it from the key on read.
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  // The object, or null when it does not exist.
  get(key: string): Promise<StorageObject | null>
  // Remove the object. Idempotent: deleting a missing key is not an error.
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
