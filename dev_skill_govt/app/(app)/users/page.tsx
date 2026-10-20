"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { getErrorMessage } from "@/lib/strings";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GovtUser {
  id: string;
  login_id: string;
  role: string;
  full_name: string;
  phone?: string;
  active: boolean;
  mfa_enabled: boolean;
  must_change_password: boolean;
  last_login_at?: string;
  created_at: string;
}

const ROLE_BADGE: Record<string, "violet" | "info" | "secondary"> = {
  super_admin: "violet",
  scheme_officer: "info",
  auditor: "secondary",
};

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [role, setRole] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState<GovtUser | null>(null);

  const [form, setForm] = React.useState({
    role: "scheme_officer",
    login_id: "",
    full_name: "",
    phone: "",
    password: "",
    must_change_password: true,
  });

  const usersQ = useQuery({
    queryKey: ["users", role],
    queryFn: () =>
      api<{ items: GovtUser[] }>(`/users?limit=100${role !== "all" ? `&role=${role}` : ""}`),
    refetchInterval: 60_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api<GovtUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          role: form.role,
          login_id: form.login_id,
          full_name: form.full_name,
          password: form.password,
          phone: form.phone || null,
          must_change_password: form.must_change_password,
        }),
      }),
    onSuccess: (u) => {
      toast.success(`User ${u.login_id} created.`);
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setForm({ role: "scheme_officer", login_id: "", full_name: "", phone: "", password: "", must_change_password: true });
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/users/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("User deactivated.");
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeactivating(null);
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string };
      toast.error(getErrorMessage(err.code, err.message));
    },
  });

  const columns: DataTableColumn<GovtUser>[] = [
    { key: "name", header: "Name", render: (u) => <span className="font-medium">{u.full_name}</span> },
    { key: "login", header: "Login ID", render: (u) => <span className="font-mono text-xs">{u.login_id}</span> },
    {
      key: "role",
      header: "Role",
      render: (u) => <Badge variant={ROLE_BADGE[u.role] ?? "secondary"}>{u.role.replace("_", " ")}</Badge>,
    },
    {
      key: "state",
      header: "State",
      render: (u) =>
        u.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="neutral">Deactivated</Badge>
        ),
    },
    {
      key: "mfa",
      header: "MFA",
      render: (u) => (u.mfa_enabled ? <Badge variant="success">On</Badge> : <Badge variant="warning">Off</Badge>),
    },
    {
      key: "last",
      header: "Last login",
      render: (u) => (
        <span className="tabular text-muted-foreground">{u.last_login_at ? timeAgo(u.last_login_at) : "Never"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (u) =>
        u.active ? (
          <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={() => setDeactivating(u)}>
              Deactivate
            </Button>
          </span>
        ) : null,
    },
  ];

  const canCreate = !!form.login_id.trim() && !!form.full_name.trim() && form.password.length >= 10;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Portal accounts for scheme officers, auditors and admins. Everyone is forced to change their temporary password at first login."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New user
          </Button>
        }
      >
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-48" aria-label="Filter by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="super_admin">Super admin</SelectItem>
                <SelectItem value="scheme_officer">Scheme officer</SelectItem>
                <SelectItem value="auditor">Auditor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageHeader>

      <DataTable
        caption="Users"
        columns={columns}
        rows={usersQ.data?.items ?? []}
        getRowId={(u) => u.id}
        loading={usersQ.isLoading}
        error={usersQ.error}
        onRetry={() => usersQ.refetch()}
        empty={
          <EmptyState
            icon={UserPlus}
            title="No users with this role"
            hint="Create the first account with the New user button."
          />
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New portal user</DialogTitle>
            <DialogDescription>Share the login ID and temporary password securely.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="urole">Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger id="urole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheme_officer">Scheme officer</SelectItem>
                    <SelectItem value="auditor">Auditor (read-only)</SelectItem>
                    <SelectItem value="super_admin">Super admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ulogin">Login ID</Label>
                <Input
                  id="ulogin"
                  className="font-mono"
                  value={form.login_id}
                  onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value.toLowerCase() }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="uname">Full name</Label>
                <Input
                  id="uname"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uphone">Phone (optional)</Label>
                <Input
                  id="uphone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upwd">Temporary password</Label>
                <div className="flex gap-2">
                  <Input
                    id="upwd"
                    className="font-mono"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))}
                  >
                    <KeyRound className="mr-1.5 h-4 w-4" aria-hidden />
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">10+ characters recommended.</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="umust">Force password change at first login</Label>
                <p className="text-xs text-muted-foreground">Recommended for shared or temporary credentials.</p>
              </div>
              <Switch
                id="umust"
                checked={form.must_change_password}
                onCheckedChange={(v) => setForm((f) => ({ ...f, must_change_password: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!canCreate} onClick={() => create.mutate()}>
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title="Deactivate user"
        description={
          deactivating
            ? `${deactivating.full_name} loses access immediately and all their sessions are revoked. This cannot be undone from here.`
            : ""
        }
        confirmText={deactivating?.login_id}
        confirmLabel="Deactivate"
        destructive
        loading={deactivate.isPending}
        onConfirm={() => deactivate.mutate(deactivating!.id)}
      />
    </div>
  );
}
