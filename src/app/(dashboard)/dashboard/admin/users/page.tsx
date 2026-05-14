import { requireAdminPage } from "@/lib/auth";
import { AdminUsersClient } from "@/components/admin-users-client";

export default async function AdminUsersPage() {
  await requireAdminPage();
  return <AdminUsersClient />;
}
