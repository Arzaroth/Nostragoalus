import { createUserCompetitionCardCodec, type UserCompetitionCardPayload } from './card-token'

// The profile share token names a user + competition: it renders that user's
// public profile card (rank, points, exacts, haul). Own domain tag so it can
// never validate as a wrapped or analytics card.
export type ProfileTokenPayload = UserCompetitionCardPayload

const codec = createUserCompetitionCardCodec('nostragoalus/profile-card/v1')

// Exposed so tests can forge an authentically-MACed token over a malformed body.
export const signProfileBody = codec.signBody
export const signProfileToken = codec.sign
export const verifyProfileToken = codec.verify
