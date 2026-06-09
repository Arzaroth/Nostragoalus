// Sentinel id for the consensus bot's ghost rows - never collides with real
// user ids and lets the client recognize the bot without a server import.
export const BOT_USER_ID = '__bot__'

export type ConsensusMethod = 'MODE' | 'MEAN'
