import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, integer } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  locale: text("locale"),
  theme: text("theme"),
  showCrowd: boolean("show_crowd"),
  showOdds: boolean("show_odds"),
  // Cosmetic skin selection (null = default theme); skinsUnlocked gates the
  // picker's visibility - flipped once the unlock easter egg is triggered.
  skin: text("skin"),
  skinsUnlocked: boolean("skins_unlocked").default(false).notNull(),
  // User-chosen: out of the global/competition rankings; profile visible only
  // to league mates and admins. League boards still rank them for co-members.
  profilePrivate: boolean("profile_private").default(false).notNull(),
  // Per-category web-push toggles (null = the category default, resolved in
  // server/utils/push/prefs). The browser permission + a push_subscription row
  // is the master gate on top of these.
  pushReminders: boolean("push_reminders"),
  pushKickoff: boolean("push_kickoff"),
  pushGoals: boolean("push_goals"),
  pushMatchResults: boolean("push_match_results"),
  pushTournament: boolean("push_tournament"),
  pushLeague: boolean("push_league"),
  pushMentions: boolean("push_mentions"),
  // Newest CHANGELOG version the user has viewed (null = not yet baselined).
  // The client stamps it to the latest released version on first load and
  // re-stamps when the changelog is opened; the delta drives the "what's new"
  // badge + the highlighted sections.
  lastSeenChangelogVersion: text("last_seen_changelog_version"),
  // Admin-managed (not a better-auth additionalField, so users cannot set it
  // through updateUser): excluded from leaderboards and rank snapshots.
  hiddenFromLeaderboard: boolean("hidden_from_leaderboard").default(false).notNull(),
  // Null = the one-time "join a league" prompt has never been dismissed.
  // Written only by the league service (dismiss/join/create), read-only client-side.
  leaguePromptDismissedAt: timestamp("league_prompt_dismissed_at"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_i_d").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at").defaultNow(),
  aaguid: text("aaguid"),
}, (t) => [index("passkey_user_id_idx").on(t.userId), index("passkey_credential_idx").on(t.credentialID)]);

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  verified: boolean("verified").default(false),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// @better-auth/sso plugin table. oidcConfig / samlConfig hold the provider
// config JSON (incl. secrets) - envelope-encrypted at rest by the adapter wrapper.
export const ssoProvider = pgTable(
  "sso_provider",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    oidcConfig: text("oidc_config"),
    samlConfig: text("saml_config"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().unique(),
    organizationId: text("organization_id"),
    domain: text("domain").notNull(),
    // @better-auth/sso domainVerification field. Defaults true: an
    // admin-registered provider is trusted to own the email domains the admin
    // assigned it, which is what drives account-linking trust in 1.6.x (the old
    // trustedProviders list is ignored). We never run the plugin's DNS-proof
    // flow - admin registration IS the trust decision.
    domainVerified: boolean("domain_verified").default(true).notNull(),
    // Ours, not the plugin's: human-readable name shown to end users
    // (e.g. the signup "this domain uses SSO" warning).
    displayName: text("display_name"),
  },
  (table) => [index("sso_provider_domain_idx").on(table.domain)],
)

// @better-auth/api-key plugin table. Field (property) names must match the
// plugin's schema exactly so the drizzle adapter resolves them; `key` holds the
// hash (never the plaintext), `referenceId` is the owning user id. Defaults
// mirror the plugin's declared field defaults.
export const apikey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    referenceId: text("reference_id").notNull(),
    configId: text("config_id").default("default").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    permissions: text("permissions"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [index("apikey_reference_id_idx").on(t.referenceId)],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
