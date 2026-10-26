import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { listPublicCharacters } from "@/lib/public-characters";

import PublicCharactersClient from "./public-characters-client";

export default async function PublicCharactersPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending");

  const characters = await listPublicCharacters();

  return (
    <PublicCharactersClient
      characters={characters}
      currentUserId={session.user.id}
      isAdmin={Boolean(session.user.admin)}
    />
  );
}
