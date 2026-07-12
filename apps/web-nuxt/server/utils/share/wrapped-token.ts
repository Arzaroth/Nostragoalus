import { createUserCompetitionCardCodec, type UserCompetitionCardPayload } from './card-token'

// The wrapped share token names a user + competition (not a prediction). It is a
// user-competition card token (see card-token.ts) under its own domain tag, so
// the wrapped/profile/analytics families can never be swapped.
export type WrappedTokenPayload = UserCompetitionCardPayload

const codec = createUserCompetitionCardCodec('nostragoalus/wrapped-card/v1')

// Exposed so tests can forge an authentically-MACed token over a malformed body.
export const signWrappedBody = codec.signBody
export const signWrappedToken = codec.sign
export const verifyWrappedToken = codec.verify
