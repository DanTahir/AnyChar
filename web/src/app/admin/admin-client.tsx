"use client";

import { useState } from "react";

type AdminUser = { discordId: string; name?: string; email?: string };

function UserTable({
  users,
  emptyMessage,
  actionLabel,
  actionClass,
  onAction,
}: {
  users: AdminUser[];
  emptyMessage: string;
  actionLabel: string;
  actionClass: string;
  onAction: (discordId: string) => void;
}) {
  if (users.length === 0) {
    return <p className="text-sm text-purple-400/50">{emptyMessage}</p>;
  }

  return (
    <table className="card w-full overflow-hidden text-left text-sm">
      <thead>
        <tr className="border-b border-purple-900/40 text-purple-300/70">
          <th className="px-4 py-2">User</th>
          <th className="px-4 py-2">Discord ID</th>
          <th className="px-4 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.discordId} className="border-b border-purple-900/30">
            <td className="px-4 py-2">{u.name ?? u.email ?? "—"}</td>
            <td className="px-4 py-2 font-mono">{u.discordId}</td>
            <td className="px-4 py-2">
              <button type="button" onClick={() => onAction(u.discordId)} className={actionClass}>
                {actionLabel}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminClient({
  pending,
  approved,
  botInviteUrl,
}: {
  pending: AdminUser[];
  approved: AdminUser[];
  botInviteUrl: string;
}) {
  const [msg, setMsg] = useState("");

  async function approve(discordId: string) {
    const res = await fetch("/api/admin/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordId }),
    });
    setMsg(res.ok ? "Approved" : (await res.json()).error);
    if (res.ok) window.location.reload();
  }

  async function unapprove(discordId: string) {
    const res = await fetch("/api/admin/unapprove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordId }),
    });
    setMsg(res.ok ? "Unapproved" : (await res.json()).error);
    if (res.ok) window.location.reload();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        {msg && <p className="mt-2 text-sm text-purple-300/70">{msg}</p>}
        <p className="mt-2 text-sm">
          Bot invite:{" "}
          <a href={botInviteUrl} className="link-accent">
            {botInviteUrl}
          </a>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-purple-100">
          Awaiting approval ({pending.length})
        </h2>
        <UserTable
          users={pending}
          emptyMessage="No users awaiting approval."
          actionLabel="Approve"
          actionClass="text-green-400 hover:text-green-300"
          onAction={approve}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-purple-100">
          Approved users ({approved.length})
        </h2>
        <UserTable
          users={approved}
          emptyMessage="No approved users yet."
          actionLabel="Unapprove"
          actionClass="text-red-400 hover:text-red-300"
          onAction={unapprove}
        />
      </section>
    </div>
  );
}
