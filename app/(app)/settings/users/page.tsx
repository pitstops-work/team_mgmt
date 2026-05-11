"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { Trash2, KeyRound, UserPlus, ArrowLeft, Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import Link from "next/link";

interface City { id: string; name: string; }
interface ZoneRow { id: string; name: string; leadId: string | null; cityId: string | null; }
interface ClusterRow { id: string; name: string; zoneId: string; rps: { id: string }[]; }
interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  designation: string;
  createdAt: string;
  cityId: string | null;
  reportsToId: string | null;
}

const ROLES = ["super-admin", "admin", "member", "viewer", "budget-admin"] as const;
type Role = typeof ROLES[number];

const DESIGNATIONS = ["RP", "ZL", "PM", "Leader", "Other"] as const;
type Designation = typeof DESIGNATIONS[number];

const ROLE_STYLE: Record<Role, string> = {
  "super-admin":  "bg-amber-100 text-amber-700",
  admin:          "bg-indigo-100 text-indigo-700",
  member:         "bg-emerald-100 text-emerald-700",
  viewer:         "bg-stone-100 text-stone-500",
  "budget-admin": "bg-sky-100 text-sky-700",
};

const DESIGNATION_STYLE: Record<Designation, string> = {
  Leader: "bg-amber-100 text-amber-700",
  ZL:     "bg-violet-100 text-violet-700",
  PM:     "bg-sky-100 text-sky-700",
  RP:     "bg-emerald-100 text-emerald-700",
  Other:  "bg-stone-100 text-stone-500",
};

// Which designations can manage which
const REPORTS_TO_FILTER: Partial<Record<Designation, Designation[]>> = {
  RP: ["ZL", "PM", "Leader"],
  ZL: ["PM", "Leader"],
  PM: ["PM", "Leader"],
};

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isSuperAdmin = session?.user?.role === "super-admin";

  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("member");
  const [editDesignation, setEditDesignation] = useState<Designation>("Other");
  const [editCityId, setEditCityId] = useState<string>("");
  const [editZoneIds, setEditZoneIds] = useState<string[]>([]);
  const [editClusterIds, setEditClusterIds] = useState<string[]>([]);
  const [editReportsToId, setEditReportsToId] = useState<string>("");
  // Cascading geo filter for RP cluster picker
  const [rpFilterZoneId, setRpFilterZoneId] = useState<string>("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Reset password
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  // Create user
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("member");
  const [newDesignation, setNewDesignation] = useState<Designation>("RP");
  const [showNewPw, setShowNewPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.replace("/login"); return; }

    fetch("/api/admin/users")
      .then(r => {
        if (r.status === 403) { router.replace("/settings"); return null; }
        return r.json();
      })
      .then(data => {
        if (data) {
          setUsers(data.users);
          setCities(data.cities);
          setZones(data.zones ?? []);
          setClusters(data.clusters ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [status, router]);

  void session;

  function startEdit(u: User) {
    setEditId(u.id);
    setEditName(u.name ?? "");
    setEditEmail(u.email);
    setEditRole((ROLES.includes(u.role as Role) ? u.role : "member") as Role);
    const desig = (DESIGNATIONS.includes(u.designation as Designation) ? u.designation : "Other") as Designation;
    setEditDesignation(desig);
    setEditCityId(u.cityId ?? "");
    setEditZoneIds(zones.filter(z => z.leadId === u.id).map(z => z.id));
    setEditClusterIds(clusters.filter(c => c.rps.some(r => r.id === u.id)).map(c => c.id));
    setEditReportsToId(u.reportsToId ?? "");
    setRpFilterZoneId("");
    setEditError("");
  }

  function cancelEdit() {
    setEditId(null);
    setEditError("");
  }

  async function saveEdit(id: string) {
    setEditError("");
    setEditSaving(true);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        email: editEmail,
        role: editRole,
        cityId: editCityId || null,
        designation: editDesignation,
        zoneIds: editDesignation === "ZL" || editDesignation === "PM" ? editZoneIds : [],
        clusterIds: editDesignation === "RP" ? editClusterIds : [],
        reportsToId: (editDesignation in REPORTS_TO_FILTER) ? (editReportsToId || null) : null,
      }),
    });
    const data = await res.json();
    setEditSaving(false);
    if (!res.ok) { setEditError(data.error ?? "Failed"); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data, reportsToId: data.reportsToId ?? u.reportsToId } : u));
    setZones(prev => prev.map(z => {
      if (editZoneIds.includes(z.id)) return { ...z, leadId: id };
      if (z.leadId === id) return { ...z, leadId: null };
      return z;
    }));
    setClusters(prev => prev.map(c => {
      const wasAssigned = c.rps.some(r => r.id === id);
      const nowAssigned = editClusterIds.includes(c.id);
      if (wasAssigned === nowAssigned) return c;
      return {
        ...c,
        rps: nowAssigned
          ? [...c.rps, { id }]
          : c.rps.filter(r => r.id !== id),
      };
    }));
    setEditId(null);
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id));
  }

  function startReset(id: string) {
    setResetTarget(id);
    setResetPw("");
    setResetError("");
    setResetSuccess("");
    setShowResetPw(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError("");
    setResetSuccess("");
    setResetting(true);
    const res = await fetch(`/api/admin/users/${resetTarget}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPw }),
    });
    const data = await res.json();
    setResetting(false);
    if (!res.ok) { setResetError(data.error ?? "Failed"); return; }
    setResetSuccess("Password updated.");
    setResetPw("");
    setTimeout(() => { setResetTarget(null); setResetSuccess(""); }, 1500);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole, designation: newDesignation }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(data.error ?? "Failed"); return; }
    setUsers(prev => [...prev, data]);
    setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("member"); setNewDesignation("RP");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex gap-1">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">User Management</h1>
        <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{users.length} users</span>
      </div>

      {/* Role legend */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {ROLES.filter(r => r !== "super-admin" || isSuperAdmin).map(r => (
          <span key={r} className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${ROLE_STYLE[r]}`}>{r}</span>
        ))}
        <span className="text-xs text-stone-400 self-center ml-1">— viewer: read-only · budget-admin: budget tool only</span>
      </div>

      {/* User list */}
      <section className="mb-10 space-y-2">
        {users.map(u => {
          const isEditing = editId === u.id;
          const role = (ROLES.includes(u.role as Role) ? u.role : "member") as Role;
          const canEditRole = u.role !== "super-admin" || isSuperAdmin;

          // Derived geo data for this user's summary line
          const userZones = zones.filter(z => z.leadId === u.id);
          const userClusters = clusters.filter(c => c.rps.some(r => r.id === u.id));

          // Cascading geo for ZL zone picker: filter zones by selected city
          const zonesInCity = editCityId
            ? zones.filter(z => z.cityId === editCityId)
            : zones;

          // Cascading geo for RP cluster picker
          const zonesInCityForRP = editCityId
            ? zones.filter(z => z.cityId === editCityId)
            : zones;
          const clustersInView = rpFilterZoneId
            ? clusters.filter(c => c.zoneId === rpFilterZoneId)
            : clusters.filter(c => zonesInCityForRP.some(z => z.id === c.zoneId));

          return (
            <div key={u.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              {/* View row */}
              {!isEditing && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={u.name} image={u.image} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-stone-800 truncate">{u.name ?? <span className="text-stone-400 italic">no name</span>}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${ROLE_STYLE[role]}`}>{role}</span>
                      {u.designation && u.designation !== "Other" && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${DESIGNATION_STYLE[(u.designation as Designation) ?? "Other"]}`}>{u.designation}</span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 truncate">{u.email}</p>
                    <p className="text-xs text-stone-300 mt-0.5 flex flex-wrap gap-x-2">
                      <span>Joined {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {u.cityId && <span className="text-sky-400">{cities.find(c => c.id === u.cityId)?.name ?? ""}</span>}
                      {userZones.map(z => <span key={z.id} className="text-violet-400">{z.name} zone</span>)}
                      {userClusters.map(c => <span key={c.id} className="text-emerald-400">{c.name}</span>)}
                      {u.reportsToId && <span className="text-amber-400">→ {users.find(m => m.id === u.reportsToId)?.name ?? "unknown"}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canEditRole && (
                      <button onClick={() => startEdit(u)} title="Edit" className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canEditRole && (
                      <button onClick={() => startReset(u.id)} title="Reset password" className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canEditRole && (
                      <button onClick={() => handleDelete(u.id, u.email)} title="Delete" className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Edit row */}
              {isEditing && (
                <div className="px-4 py-3 bg-indigo-50/60 space-y-3">
                  {/* Name + Email */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Full name"
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                    <input
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="Email"
                      type="email"
                      required
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>

                  {/* Role + Designation + City */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1.5">
                      {ROLES.filter(r => r !== "super-admin" && (r !== "admin" || isSuperAdmin)).map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setEditRole(r)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize transition-colors ${
                            editRole === r ? ROLE_STYLE[r] + " ring-2 ring-offset-1 ring-current" : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-indigo-200 flex-shrink-0" />
                    <div className="flex gap-1.5">
                      {DESIGNATIONS.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setEditDesignation(d);
                            setRpFilterZoneId("");
                          }}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                            editDesignation === d ? DESIGNATION_STYLE[d] + " ring-2 ring-offset-1 ring-current" : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-indigo-200 flex-shrink-0" />
                    <select
                      value={editCityId}
                      onChange={e => {
                        setEditCityId(e.target.value);
                        setEditZoneIds([]);
                        setEditClusterIds([]);
                        setRpFilterZoneId("");
                      }}
                      className="text-xs border border-indigo-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="">All cities</option>
                      {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex gap-1.5 ml-auto">
                      <button
                        onClick={() => saveEdit(u.id)}
                        disabled={editSaving}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />{editSaving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={cancelEdit} className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* ZL / PM — zone picker filtered by city */}
                  {(editDesignation === "ZL" || editDesignation === "PM") && (
                    <div>
                      <p className="text-[10px] font-semibold text-indigo-600 mb-1.5">
                        Zone Lead for{editCityId ? ` (${cities.find(c => c.id === editCityId)?.name ?? ""})` : " — select a city to filter"}
                      </p>
                      {zonesInCity.length === 0 ? (
                        <p className="text-xs text-stone-400">No zones in selected city.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {zonesInCity.map(z => {
                            const checked = editZoneIds.includes(z.id);
                            return (
                              <button
                                key={z.id}
                                type="button"
                                onClick={() => setEditZoneIds(prev => checked ? prev.filter(id => id !== z.id) : [...prev, z.id])}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${checked ? "bg-violet-100 border-violet-400 text-violet-800" : "border-stone-200 text-stone-500 hover:border-violet-300 hover:bg-violet-50"}`}
                              >
                                {z.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reports To — shown for RP, ZL, PM */}
                  {editDesignation in REPORTS_TO_FILTER && (() => {
                    const allowedDesigs = REPORTS_TO_FILTER[editDesignation as keyof typeof REPORTS_TO_FILTER]!;
                    const label = editDesignation === "RP" ? "Reports To (ZL / PM / Leader)" : editDesignation === "ZL" ? "Reports To (PM / Leader)" : "Reports To (PM / Leader)";
                    const managers = users.filter(m => allowedDesigs.includes(m.designation as Designation));
                    return (
                      <div>
                        <p className="text-[10px] font-semibold text-amber-700 mb-1.5">{label}</p>
                        <select
                          value={editReportsToId}
                          onChange={e => setEditReportsToId(e.target.value)}
                          className="text-sm border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 w-full max-w-xs"
                        >
                          <option value="">— none —</option>
                          {managers.map(m => (
                            <option key={m.id} value={m.id}>{m.name ?? m.email} ({m.designation})</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  {/* RP — cascading city → zone filter → cluster picker */}
                  {editDesignation === "RP" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold text-emerald-700">Clusters</p>
                        {/* Zone filter within the city */}
                        {zonesInCityForRP.length > 0 && (
                          <select
                            value={rpFilterZoneId}
                            onChange={e => setRpFilterZoneId(e.target.value)}
                            className="text-xs border border-emerald-200 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          >
                            <option value="">All zones{editCityId ? "" : " (select city first)"}</option>
                            {zonesInCityForRP.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                          </select>
                        )}
                        {editClusterIds.length > 0 && (
                          <span className="text-[10px] text-emerald-600 ml-auto">{editClusterIds.length} selected</span>
                        )}
                      </div>
                      {!editCityId ? (
                        <p className="text-xs text-stone-400">Select a city above to see clusters.</p>
                      ) : clustersInView.length === 0 ? (
                        <p className="text-xs text-stone-400">No clusters in {rpFilterZoneId ? "selected zone" : "this city"}.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                          {clustersInView.map(c => {
                            const checked = editClusterIds.includes(c.id);
                            const zoneName = zones.find(z => z.id === c.zoneId)?.name ?? "";
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setEditClusterIds(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${checked ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-stone-200 text-stone-500 hover:border-emerald-300 hover:bg-emerald-50"}`}
                                title={zoneName}
                              >
                                {c.name}
                                {!rpFilterZoneId && zoneName && <span className="opacity-50 ml-1">· {zoneName}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {editError && <p className="text-xs text-red-500">{editError}</p>}
                </div>
              )}

              {/* Reset password panel */}
              {resetTarget === u.id && (
                <div className="px-4 py-3 border-t border-sky-100 bg-sky-50/60">
                  <form onSubmit={handleResetPassword} className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                      <input
                        type={showResetPw ? "text" : "password"}
                        value={resetPw}
                        onChange={e => setResetPw(e.target.value)}
                        placeholder="New password (min 8 chars)"
                        minLength={8}
                        required
                        autoFocus
                        className="w-full px-2.5 py-1.5 text-sm border border-sky-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white pr-8"
                      />
                      <button type="button" onClick={() => setShowResetPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                        {showResetPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button type="submit" disabled={resetting} className="px-2.5 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50">
                      {resetting ? "…" : "Set"}
                    </button>
                    <button type="button" onClick={() => setResetTarget(null)} className="px-2.5 py-1.5 text-xs text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50">
                      Cancel
                    </button>
                  </form>
                  {resetError && <p className="text-xs text-red-500 mt-1">{resetError}</p>}
                  {resetSuccess && <p className="text-xs text-emerald-600 mt-1">{resetSuccess}</p>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Add user */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">Add User</h2>
        </div>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Full name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
            />
            <input
              type="email"
              placeholder="Email"
              required
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
            />
          </div>
          <div className="flex gap-3 items-center">
            <div className="relative max-w-xs flex-1">
              <input
                type={showNewPw ? "text" : "password"}
                placeholder="Password (min 8 chars)"
                required
                minLength={8}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white pr-9"
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {ROLES.filter(r => r !== "super-admin" && (r !== "admin" || isSuperAdmin)).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setNewRole(r)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-full capitalize transition-colors ${
                    newRole === r ? ROLE_STYLE[r] + " ring-2 ring-offset-1 ring-current" : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                  }`}
                >
                  {r}
                </button>
              ))}
              <div className="w-px h-5 self-center bg-stone-200" />
              {DESIGNATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNewDesignation(d)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors ${
                    newDesignation === d ? DESIGNATION_STYLE[d] + " ring-2 ring-offset-1 ring-current" : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create user"}
          </button>
        </form>
      </section>
    </div>
  );
}
