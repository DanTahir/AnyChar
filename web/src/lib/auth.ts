import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

import { AnyCharAdapter } from "./auth-adapter";
import { config } from "./config";
import { getItem, updateItem, userSk } from "./dynamo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: AnyCharAdapter(),
  secret: config.authSecret,
  trustHost: true,
  session: { strategy: "database" },
  providers: [
    Discord({
      clientId: config.discordClientId,
      clientSecret: config.discordClientSecret,
      // Discord now returns `iss=https://discord.com` on the OAuth redirect
      // (RFC 9207). Without an explicit issuer, Auth.js falls back to
      // "https://authjs.dev" and oauth4webapi rejects the callback.
      issuer: "https://discord.com",
      authorization: {
        params: { scope: "identify email guilds" },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "discord") return true;
      const discordId = account.providerAccountId;
      const existing = await getItem("USERS", userSk(discordId));

      // Update in place rather than rewriting the whole item: a full put would
      // silently drop every attribute not listed here (adult content setting,
      // budget, usage cost, preferred model, BTC credits, ...).
      const sets = [
        "#id = :id",
        "#discordId = :id",
        "#approved = if_not_exists(#approved, :false)",
        "#admin = if_not_exists(#admin, :false)",
        "#usageInputTokens = if_not_exists(#usageInputTokens, :zero)",
        "#usageOutputTokens = if_not_exists(#usageOutputTokens, :zero)",
        "#gsi1pk = :gsi1pk",
        "#gsi1sk = :gsi1sk",
      ];
      const names: Record<string, string> = {
        "#id": "id",
        "#discordId": "discordId",
        "#approved": "approved",
        "#admin": "admin",
        "#usageInputTokens": "usageInputTokens",
        "#usageOutputTokens": "usageOutputTokens",
        "#gsi1pk": "gsi1pk",
        "#gsi1sk": "gsi1sk",
      };
      const values: Record<string, unknown> = {
        ":id": discordId,
        ":false": false,
        ":zero": 0,
        ":gsi1pk": existing?.approved ? "APPROVAL#approved" : "APPROVAL#pending",
        ":gsi1sk": userSk(discordId),
      };
      // Only refresh profile fields Discord actually returned this time.
      const profileFields: Record<string, unknown> = {
        name: user.name ?? (profile as { username?: string })?.username,
        email: user.email,
        image: user.image,
      };
      for (const [field, value] of Object.entries(profileFields)) {
        if (value === undefined || value === null) continue;
        sets.push(`#${field} = :${field}`);
        names[`#${field}`] = field;
        values[`:${field}`] = value;
      }
      await updateItem("USERS", userSk(discordId), `SET ${sets.join(", ")}`, values, names);
      user.id = discordId;
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const profile = await getItem("USERS", userSk(user.id));
        session.user.approved = Boolean(profile?.approved);
        session.user.admin = Boolean(profile?.admin);
      }
      return session;
    },
  },
});
