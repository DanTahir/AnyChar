"use client";

import { useState } from "react";

import { botInviteUrl } from "@/lib/config";

export default function AdminPage({ pending }: { pending: { discordId: string; name?: string; email?: string }[] }) {
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      {msg && <p className="text-sm text-zinc-400">{msg}</p>}
      <p className="text-sm">
        Bot invite:{" "}
        <a href={botInviteUrl()} className="text-indigo-400 underline">
          {botInviteUrl()}
        </a>
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400">
            <th className="py-2">User</th>
            <th className="py-2">Discord ID</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pending.map((u) => (
            <tr key={u.discordId} className="border-b border-zinc-900">
              <td className="py-2">{u.name ?? u.email ?? "—"}</td>
              <td className="py-2 font-mono">{u.discordId}</td>
              <td className="py-2 space-x-2">
                <button onClick={() => approve(u.discordId)} className="text-green-400">Approve</button>
                <button onClick={() => unapprove(u.discordId)} className="text-red-400">Unapprove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
