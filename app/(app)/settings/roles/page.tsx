"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Shield } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { roleStyle } from "@/lib/roleStyle";

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  updatedAt: string;
};


export default function RolesListPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isSuperAdmin = session?.user?.role === "super-admin";

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (!isSuperAdmin) { router.replace("/settings"); return; }
    fetch("/api/admin/rbac/roles")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => setRoles(data))
      .catch(() => setError("Failed to load roles"))
      .finally(() => setLoading(false));
  }, [status, isSuperAdmin, router]);

  if (status === "loading" || !isSuperAdmin) return null;

  return (
    <SurfaceProvider id="settings.roles">
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>

      <h1 className="text-xl font-semibold text-stone-900 mb-1">Roles &amp; Permissions</h1>
      <p className="text-sm text-stone-500 mb-6">
        Edit what each role can do and which records they see. Changes apply immediately to all users with that role.
      </p>

      {loading && <p className="text-sm text-stone-400">Loading…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-2">
        {roles.map((role) => (
          <Link
            key={role.id}
            href={`/settings/roles/${role.id}`}
            className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 hover:border-stone-300 transition-colors"
          >
            <Shield className="w-4 h-4 text-stone-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${roleStyle(role.name)}`}>
                  {role.name}
                </span>
                {role.isSystem && (
                  <span className="text-[10px] uppercase tracking-wide text-stone-400">system</span>
                )}
              </div>
              {role.description && (
                <p className="text-xs text-stone-500 mt-1 line-clamp-1">{role.description}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-500">{role.permissionCount} permissions</p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300" />
          </Link>
        ))}
      </div>

      {/* Signpost: the partner apps aren't governed by this RBAC catalogue. */}
      <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500 leading-relaxed">
        <span className="font-medium text-stone-600">Budget &amp; Seeding access is managed separately.</span> The{" "}
        <span className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 font-medium">budget-admin</span> role unlocks
        the Budget and Seeding portals. A person&apos;s working role inside Seeding (central / geo / viewer) is assigned
        in <span className="font-medium">Seeding → Members</span>, not here.
      </div>
    </div>
    </SurfaceProvider>
  );
}
