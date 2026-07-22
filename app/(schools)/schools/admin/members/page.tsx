import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import { addMember, removeMember } from "../../actions";
import { SCHOOL_PLAN_ROLES, schoolPlanRoleLabel } from "@/lib/schoolPlan/roles";
import MembersClient from "../../[id]/_components/MembersClient";

export default async function MembersAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canManageStructure) redirect("/schools");

  const [members, plans] = await Promise.all([
    prisma.schoolPlanMember.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        user: { select: { name: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.schoolPlan.findMany({ orderBy: [{ name: "asc" }], select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href="/schools" className="hover:text-stone-700">← Plans</Link>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Members</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Grant access. Central roles see all plans; plan-scoped roles are pinned to one plan.
        </p>
      </div>

      <MembersClient
        roles={SCHOOL_PLAN_ROLES.map((r) => ({ key: r.key, label: r.label, scope: r.scope }))}
        plans={plans}
        addAction={addMember}
        removeAction={removeMember}
      />

      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-widest">
            <tr>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              <th className="text-left px-3 py-2 font-medium">Scope</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-stone-100">
                <td className="px-3 py-2">{m.user.name ?? m.user.email}</td>
                <td className="px-3 py-2">{schoolPlanRoleLabel(m.role)}</td>
                <td className="px-3 py-2 text-stone-500">{m.plan?.name ?? "all plans"}</td>
                <td className="px-3 py-2 text-right">
                  <form action={async () => { "use server"; await removeMember(m.id); }}>
                    <button className="text-rose-600 hover:text-rose-800 text-[11px]">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-stone-400 italic">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
