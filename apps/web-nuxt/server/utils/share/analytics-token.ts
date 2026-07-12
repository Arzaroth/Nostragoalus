import { createUserCompetitionCardCodec, type UserCompetitionCardPayload } from './card-token'

// The analytics share token names a user + competition: it renders that user's
// personal-analytics (bias detector) card. Own domain tag so it can never
// validate as a wrapped or profile card.
export type AnalyticsTokenPayload = UserCompetitionCardPayload

const codec = createUserCompetitionCardCodec('nostragoalus/analytics-card/v1')

// Exposed so tests can forge an authentically-MACed token over a malformed body.
export const signAnalyticsBody = codec.signBody
export const signAnalyticsToken = codec.sign
export const verifyAnalyticsToken = codec.verify
