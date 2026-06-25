import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
} from "next-auth/adapters";

import {
  deleteItem,
  getItem,
  putItem,
  queryGsi1,
  updateItem,
  userSk,
} from "./dynamo";

function sessionSk(token: string) {
  return `SESSION#${token}`;
}

function accountSk(userId: string, provider: string, providerAccountId: string) {
  return `USERID#${userId}#ACCOUNT#${provider}#${providerAccountId}`;
}

export function AnyCharAdapter(): Adapter {
  return {
    async createUser(user) {
      const discordId = user.id!;
      const item = {
        pk: "USERS",
        sk: userSk(discordId),
        id: discordId,
        discordId,
        name: user.name,
        email: user.email,
        image: user.image,
        emailVerified: user.emailVerified,
        approved: false,
        admin: false,
        gsi1pk: "APPROVAL#pending",
        gsi1sk: userSk(discordId),
        usageInputTokens: 0,
        usageOutputTokens: 0,
      };
      await putItem(item);
      return { ...user, id: discordId } as AdapterUser;
    },

    async getUser(id) {
      const item = await getItem("USERS", userSk(id));
      if (!item) return null;
      return {
        id: item.discordId as string,
        name: (item.name as string | null) ?? null,
        email: (item.email as string) ?? "",
        emailVerified: item.emailVerified ? new Date(item.emailVerified as string) : null,
        image: (item.image as string | null) ?? null,
      } as AdapterUser;
    },

    async getUserByEmail(email) {
      const items = await queryGsi1(`EMAIL#${email}`);
      if (!items.length) return null;
      return this.getUser!(items[0].discordId as string);
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const items = await queryGsi1(`ACCOUNT#${provider}#${providerAccountId}`);
      if (!items.length) return null;
      const discordId = items[0].discordId as string;
      return this.getUser!(discordId);
    },

    async updateUser(user) {
      const sk = userSk(user.id!);
      await updateItem(
        "USERS",
        sk,
        "SET #name = :name, email = :email, image = :image",
        {
          ":name": user.name,
          ":email": user.email,
          ":image": user.image,
        },
        { "#name": "name" },
      );
      return user as AdapterUser;
    },

    async linkAccount(account) {
      const userId = account.userId;
      await putItem({
        pk: "USERS",
        sk: accountSk(userId, account.provider, account.providerAccountId),
        gsi1pk: `ACCOUNT#${account.provider}#${account.providerAccountId}`,
        gsi1sk: userSk(userId),
        discordId: userId,
        ...account,
      });
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      const items = await queryGsi1(`ACCOUNT#${provider}#${providerAccountId}`);
      for (const item of items) {
        await deleteItem(item.pk as string, item.sk as string);
      }
    },

    async createSession(session) {
      const expires = session.expires;
      await putItem({
        pk: "USERS",
        sk: sessionSk(session.sessionToken),
        sessionToken: session.sessionToken,
        userId: session.userId,
        expires: expires instanceof Date ? expires.toISOString() : expires,
      });
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const sess = await getItem("USERS", sessionSk(sessionToken));
      if (!sess) return null;
      const user = await this.getUser!(sess.userId as string);
      if (!user) return null;
      return {
        session: {
          sessionToken,
          userId: sess.userId as string,
          expires: new Date(sess.expires as string),
        } as AdapterSession,
        user,
      };
    },

    async updateSession(session) {
      await updateItem(
        "USERS",
        sessionSk(session.sessionToken),
        "SET expires = :e",
        { ":e": session.expires instanceof Date ? session.expires.toISOString() : session.expires },
      );
      return session as AdapterSession;
    },

    async deleteSession(sessionToken) {
      await deleteItem("USERS", sessionSk(sessionToken));
    },

    async createVerificationToken() {
      return null as never;
    },
    async useVerificationToken() {
      return null;
    },
  };
}
