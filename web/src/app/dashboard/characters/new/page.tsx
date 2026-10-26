import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getAppUser } from "@/lib/users";

import NewCharacterForm from "./new-character-form";

export default async function NewCharacterPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending");

  const user = await getAppUser(session.user.id);
  return <NewCharacterForm adultContentEnabled={Boolean(user?.adultContentEnabled)} />;
}
