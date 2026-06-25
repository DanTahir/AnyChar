declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      approved?: boolean;
      admin?: boolean;
    };
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    id: string;
  }
}

export {};
