import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, permissionsFor, PERMISSION_LABELS, ROLES, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, Section, EmptyState } from "@/components/data/page-header";
import { AddUserForm, UserTable, type UserRow } from "@/components/admin/user-admin";

export const metadata = { title: "Users" };

function ago(d: Date | null | undefined) {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default async function UsersPage() {
  const me = await requireUser();
  if (!can(me.role, "admin.users")) {
    return (
      <>
        <PageHeader title="Users" />
        <EmptyState title="Only administrators can manage users">Ask an administrator to add an account or change a role.</EmptyState>
      </>
    );
  }

  const [users, logins] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, active: true } }),
    db.auditLog.groupBy({ by: ["userId"], where: { action: "auth.login" }, _max: { createdAt: true } }),
  ]);
  const lastLogin = new Map(logins.map((l) => [l.userId, l._max.createdAt]));
  const rows: UserRow[] = users.map((u) => ({ ...u, lastSignIn: ago(lastLogin.get(u.id)), isMe: u.id === me.id }));
  const inactive = users.filter((u) => !u.active).length;

  return (
    <>
      <PageHeader title="Users" description="Who can sign in and what each role can do. Changes apply on the person's next click." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Section title={`People · ${users.length - inactive} active${inactive ? `, ${inactive} deactivated` : ""}`} className="min-w-0 self-start">
          <UserTable users={rows} />
        </Section>
        <div className="space-y-6">
          <AddUserForm />
          <Section title="What each role can do">
            <dl className="divide-y text-sm">
              {ROLES.map((r) => {
                const perms = permissionsFor(r);
                return (
                  <div key={r} className="px-4 py-2.5">
                    <dt className="font-medium">{ROLE_LABELS[r]}</dt>
                    <dd className="mt-0.5 text-xs text-muted-foreground">
                      {perms.length ? perms.map((p) => PERMISSION_LABELS[p]).join(" · ") : "Read-only: sees everything, changes nothing"}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Every role can view all pages. Changes here are recorded in the audit log.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
