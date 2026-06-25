import { auth } from "@/lib/auth";

export default async function PendingPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Awaiting approval</h1>
      <p className="text-zinc-400">
        Hi {session.user.name}. An admin needs to approve your account before you can create
        characters and link servers.
      </p>
    </div>
  );
}
