"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { changeRole, createUser, setActive, setPassword, type UserActionState } from "@/app/(app)/admin/users/actions";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import { generatePassword, PASSWORD_MIN } from "@/lib/users";
import { RiskDot } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export type UserRow = { id: string; name: string; email: string; role: Role; active: boolean; lastSignIn: string; isMe: boolean };

function report(res: UserActionState) {
  if (res?.error) toast.error(res.error);
  else if (res?.message) toast.success(res.message);
  return !res?.error;
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        id={id}
        name="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={PASSWORD_MIN}
        autoComplete="new-password"
        spellCheck={false}
        className={`${field} num`}
        placeholder={`At least ${PASSWORD_MIN} characters`}
      />
      <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => onChange(generatePassword())}>
        Generate
      </Button>
    </div>
  );
}

export function AddUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [password, setPw] = useState("");
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (!state) return;
    if (report(state)) {
      setPw("");
      setFormKey((k) => k + 1);
    }
  }, [state]);
  return (
    <form key={formKey} action={action} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="text-sm font-medium">Add a user</div>
      <div className="space-y-1.5">
        <Label htmlFor="u-name">Name</Label>
        <input id="u-name" name="name" required autoComplete="off" className={field} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-email">Email</Label>
        <input id="u-email" name="email" type="email" required autoComplete="off" className={field} placeholder="name@company.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-role">Role</Label>
        <select id="u-role" name="role" defaultValue="VIEWER" className={field}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-password">Starting password</Label>
        <PasswordField id="u-password" value={password} onChange={setPw} />
        <p className="text-xs text-muted-foreground">Shown here so you can pass it on. They can ask you to change it later.</p>
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Adding…" : "Add user"}
      </Button>
    </form>
  );
}

function PasswordDialog({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [password, setPw] = useState("");
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      if (report(await setPassword(user.id, password))) {
        setOpen(false);
        setPw("");
      }
    });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPw(""); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8">Set password</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New password for {user.name}</DialogTitle>
          <DialogDescription>
            {user.isMe ? "You'll be signed out and need the new password to sign in again." : "They'll be signed out everywhere and need this password to sign in."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`pw-${user.id}`}>New password</Label>
          <PasswordField id={`pw-${user.id}`} value={password} onChange={setPw} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-10">Cancel</Button>
          </DialogClose>
          <Button className="h-10" disabled={pending || password.length < PASSWORD_MIN} onClick={save}>
            {pending ? "Saving…" : "Set password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-risk-red hover:text-risk-red">Deactivate</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {user.name}?</DialogTitle>
          <DialogDescription>
            They’re signed out straight away and can’t sign in until reactivated. Their BoMs, RFQs and history stay as they are.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-10">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            className="h-10"
            disabled={pending}
            onClick={() => start(async () => { if (report(await setActive(user.id, false))) setOpen(false); })}
          >
            {pending ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserTableRow({ user }: { user: UserRow }) {
  const [role, setRole] = useState(user.role);
  const [pending, start] = useTransition();
  useEffect(() => setRole(user.role), [user.role]);
  const onRole = (next: Role) => {
    const prev = role;
    setRole(next);
    start(async () => {
      if (!report(await changeRole(user.id, next))) setRole(prev);
    });
  };
  return (
    <tr className={user.active ? undefined : "text-muted-foreground"}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 font-medium text-foreground">
          {user.name}
          {user.isMe ? <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">You</span> : null}
        </div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="px-4 py-2.5">
        <select
          aria-label={`Role for ${user.name}`}
          value={role}
          disabled={user.isMe || pending}
          title={user.isMe ? "You can't change your own role" : undefined}
          onChange={(e) => onRole(e.target.value as Role)}
          className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <RiskDot level={user.active ? "green" : "grey"} />
          {user.active ? "Active" : "Deactivated"}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{user.lastSignIn}</td>
      <td className="px-2 py-2.5 text-right whitespace-nowrap">
        <PasswordDialog user={user} />
        {user.isMe ? null : user.active ? (
          <DeactivateDialog user={user} />
        ) : (
          <Button variant="ghost" size="sm" className="h-8" disabled={pending} onClick={() => start(async () => void report(await setActive(user.id, true)))}>
            Reactivate
          </Button>
        )}
      </td>
    </tr>
  );
}

export function UserTable({ users }: { users: UserRow[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-normal">Person</th>
            <th className="px-4 py-2 font-normal">Role</th>
            <th className="px-4 py-2 font-normal">Status</th>
            <th className="px-4 py-2 font-normal">Last sign-in</th>
            <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => (
            <UserTableRow key={u.id} user={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
