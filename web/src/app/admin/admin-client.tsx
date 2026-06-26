"use client";

import { useState } from "react";

type AdminUser = {
  discordId: string;
  name?: string;
  email?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

const numberFmt = new Intl.NumberFormat("en-US");

function UserTable({
  users,
  emptyMessage,
  actionLabel,
  actionClass,
  onAction,
  showUsage = false,
}: {
  users: AdminUser[];
  emptyMessage: string;
  actionLabel: string;
  actionClass: string;
  onAction: (discordId: string) => void;
  showUsage?: boolean;
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
          {showUsage && <th className="px-4 py-2">Token spending</th>}
          <th className="px-4 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const total = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
          return (
            <tr key={u.discordId} className="border-b border-purple-900/30">
              <td className="px-4 py-2">{u.name ?? u.email ?? "—"}</td>
              <td className="px-4 py-2 font-mono">{u.discordId}</td>
              {showUsage && (
                <td className="px-4 py-2">
                  <div className="font-medium text-purple-100">
                    {numberFmt.format(total)} tokens
                  </div>
                  <div className="text-xs text-purple-300/60">
                    {numberFmt.format(u.inputTokens ?? 0)} in ·{" "}
                    {numberFmt.format(u.outputTokens ?? 0)} out · ~$
                    {(u.costUsd ?? 0).toFixed(4)}
                  </div>
                </td>
              )}
              <td className="px-4 py-2">
                <button type="button" onClick={() => onAction(u.discordId)} className={actionClass}>
                  {actionLabel}
                </button>
              </td>
            </tr>
          );
        })}
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
          showUsage
        />
      </section>
    </div>
  );
}
