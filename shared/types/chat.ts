// Wire shape for an encrypted chat message. The server fills everything except
// the plaintext: ciphertext stays opaque to it. matchId null = the league-global
// room, set = a per-match thread. createdAt is an ISO string over the wire.
export interface ChatMessageDTO {
  id: string
  leagueId: string
  matchId: string | null
  userId: string | null
  epoch: number
  ciphertext: string
  createdAt: string
}
