import Image from "next/image";

import { auth } from "@/lib/auth";

export default async function PendingPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-8">
      <div className="card p-8 text-center">
        {session.user.image && (
          <Image
            src={session.user.image}
            alt=""
            width={64}
            height={64}
            className="mx-auto rounded-full ring-4 ring-purple-600/40"
          />
        )}
        <p className="mt-4 text-sm font-medium uppercase tracking-wider text-purple-400">
          Signed in as {session.user.name}
        </p>
        <h1 className="mt-2 text-2xl font-bold">Awaiting approval</h1>
        <p className="mt-3 text-purple-300/80">
          An admin needs to approve your account before you can create characters and link
          servers. Check back soon — you&apos;re all set on your end.
        </p>
      </div>
    </div>
  );
}
