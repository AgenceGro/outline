import { CollectionPermission, DocumentPermission } from "@shared/types";
import type { Permission } from "~/types";
import { EmptySelectValue } from "~/types";

type GrantOptions = {
  /** Whether an agent manages the collection, or the document's collection. */
  managed: boolean;
  /** Whether policy allows the user to manage who has access. */
  canManageUsers: boolean;
  /** Whether the user is an admin. */
  isAdmin: boolean;
};

/**
 * Whether the user can give people and groups access. On managed content,
 * only admins can, in addition to what policy allows.
 *
 * @param options whether the content is managed, the policy, and the role.
 * @returns true when the user can grant access.
 */
export function canGrantAccess({
  managed,
  canManageUsers,
  isAdmin,
}: GrantOptions): boolean {
  return managed ? canManageUsers && isAdmin : canManageUsers;
}

const editPermissions: Permission["value"][] = [
  CollectionPermission.ReadWrite,
  DocumentPermission.ReadWrite,
];

/**
 * Limits permission choices on managed content to edit access, since everyone
 * can already read it. The current permission and removal stay available so
 * an existing grant still displays and can be taken away.
 *
 * @param permissions the choices offered on unmanaged content.
 * @param current the permission currently granted, if any.
 * @returns the choices offered on managed content.
 */
export function managedPermissions(
  permissions: Permission[],
  current?: Permission["value"] | null
): Permission[] {
  return permissions
    .filter(
      (permission) =>
        editPermissions.includes(permission.value) ||
        permission.value === current ||
        permission.value === EmptySelectValue
    )
    .map((permission, index) =>
      index === 0 && permission.divider
        ? { ...permission, divider: false }
        : permission
    );
}
