import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

import { AnyCharAdapter } from "./auth-adapter";
import { config } from "./config";
import { getItem, putItem, userSk } from "./dynamo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: AnyCharAdapter(),
  secret: config.authSecret,
  trustHost: true,
  session: { strategy: "database" },
  providers: [
    Discord({
      clientId: config.discordClientId,
      clientSecret: config.discordClientSecret,
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
      await putItem({
        pk: "USERS",
        sk: userSk(discordId),
        id: discordId,
        discordId,
        name: user.name ?? (profile as { username?: string })?.username,
        email: user.email ?? existing?.email,
        image: user.image ?? existing?.image,
        approved: existing?.approved ?? false,
        admin: existing?.admin ?? false,
        openRouterApiKey: existing?.openRouterApiKey,
        openRouterKeyId: existing?.openRouterKeyId,
        usageInputTokens: existing?.usageInputTokens ?? 0,
        usageOutputTokens: existing?.usageOutputTokens ?? 0,
        dmCharacterSlug: existing?.dmCharacterSlug,
        dmCharacterName: existing?.dmCharacterName,
        gsi1pk: existing?.approved ? "APPROVAL#approved" : "APPROVAL#pending",
        gsi1sk: userSk(discordId),
      });
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
