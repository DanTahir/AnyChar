import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getAppUser } from "@/lib/users";

import AdultContentSetting from "./adult-content-setting";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending");

  const user = await getAppUser(session.user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-purple-300/70">Manage your account preferences.</p>
      </div>

      <section className="card p-5">
        <AdultContentSetting initialEnabled={Boolean(user?.adultContentEnabled)} />
      </section>
    </div>
  );
}
