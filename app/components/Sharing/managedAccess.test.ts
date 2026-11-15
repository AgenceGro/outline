import { CollectionPermission, DocumentPermission } from "@shared/types";
import type { Permission } from "~/types";
import { EmptySelectValue } from "~/types";
import { canGrantAccess, managedPermissions } from "./managedAccess";

const permissions: Permission[] = [
  { label: "View only", value: CollectionPermission.Read },
  { label: "Can edit", value: CollectionPermission.ReadWrite },
  { label: "Manage", value: CollectionPermission.Admin },
  { divider: true, label: "Remove", value: EmptySelectValue },
];

describe("canGrantAccess", () => {
  it("follows policy on unmanaged content", () => {
    expect(
      canGrantAccess({ managed: false, canManageUsers: true, isAdmin: false })
    ).toBe(true);
    expect(
      canGrantAccess({ managed: false, canManageUsers: false, isAdmin: true })
    ).toBe(false);
  });

  it("requires an admin on managed content", () => {
    expect(
      canGrantAccess({ managed: true, canManageUsers: true, isAdmin: false })
    ).toBe(false);
    expect(
      canGrantAccess({ managed: true, canManageUsers: true, isAdmin: true })
    ).toBe(true);
  });

  it("never grants beyond policy, even for admins", () => {
    expect(
      canGrantAccess({ managed: true, canManageUsers: false, isAdmin: true })
    ).toBe(false);
  });
});

describe("managedPermissions", () => {
  it("offers edit access and removal only", () => {
    expect(managedPermissions(permissions).map((p) => p.value)).toEqual([
      CollectionPermission.ReadWrite,
      EmptySelectValue,
    ]);
  });

  it("keeps the current permission so it still displays", () => {
    expect(
      managedPermissions(permissions, CollectionPermission.Admin).map(
        (p) => p.value
      )
    ).toEqual([
      CollectionPermission.ReadWrite,
      CollectionPermission.Admin,
      EmptySelectValue,
    ]);
  });

  it("keeps the divider before removal", () => {
    const result = managedPermissions(permissions);
    expect(result[0].divider).toBeFalsy();
    expect(result[1].divider).toBe(true);
  });

  it("works with document permissions", () => {
    const documentPermissions: Permission[] = [
      { label: "View only", value: DocumentPermission.Read },
      { label: "Can edit", value: DocumentPermission.ReadWrite },
      { label: "Manage", value: DocumentPermission.Admin },
    ];
    expect(
      managedPermissions(documentPermissions, DocumentPermission.Read).map(
        (p) => p.value
      )
    ).toEqual([DocumentPermission.Read, DocumentPermission.ReadWrite]);
  });

  it("drops a leading divider", () => {
    const result = managedPermissions([
      {
        divider: true,
        label: "Can edit",
        value: CollectionPermission.ReadWrite,
      },
    ]);
    expect(result[0].divider).toBe(false);
  });
});
