// What a server value looks like after JSON transport: Date becomes an ISO
// string (h3/$fetch serialize it). Used to derive client types from server
// query return types so they can never drift from the schema.
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T
