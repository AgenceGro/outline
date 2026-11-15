import { resolve } from "~/actions";
import type User from "~/models/User";
import stores from "~/stores";
import type { ActionContext } from "~/types";
import {
  activateUser,
  changeUserAvatar,
  changeUserEmail,
  changeUserName,
  changeUserRole,
  deleteUser,
  resendInvite,
  revokeInvite,
  suspendUser,
} from "./users";

const abilities = {
  update: true,
  promote: true,
  demote: true,
  suspend: true,
  activate: true,
  resendInvite: true,
  delete: true,
};

function contextFor(user: User) {
  stores.policies.add({ id: user.id, abilities });
  return {
    isMenu: true,
    isCommandBar: false,
    isButton: false,
    activeDocumentId: undefined,
    currentUserId: "f0000000-0000-4000-8000-000000000000",
    currentTeamId: undefined,
    stores,
    getActiveModels: () => [user],
  } as unknown as ActionContext;
}

describe("user actions", () => {
  const person = stores.users.add({
    id: "b1111111-1111-4111-8111-111111111111",
    name: "Ada",
    lastActiveAt: "2026-11-01T00:00:00.000Z",
  });
  const agent = stores.users.add({
    id: "b2222222-2222-4222-8222-222222222222",
    name: "Altai",
    lastActiveAt: "2026-11-01T00:00:00.000Z",
    agent: "altai",
  });
  const invitedAgent = stores.users.add({
    id: "b3333333-3333-4333-8333-333333333333",
    name: "Altai invited",
    agent: "altai",
  });
  const suspendedAgent = stores.users.add({
    id: "b4444444-4444-4444-8444-444444444444",
    name: "Altai suspended",
    lastActiveAt: "2026-11-01T00:00:00.000Z",
    isSuspended: true,
    agent: "altai",
  });

  const visible = (action: { visible?: unknown }, user: User) =>
    resolve<boolean>(action.visible, contextFor(user));

  it("offers the usual actions on a person", () => {
    for (const action of [
      changeUserRole,
      changeUserAvatar,
      changeUserName,
      changeUserEmail,
      suspendUser,
      deleteUser,
      resendInvite,
    ]) {
      expect(visible(action, person)).toBe(true);
    }
  });

  it("offers no action on an agent", () => {
    const roleActions = resolve<{ visible?: unknown }[]>(
      changeUserRole.children,
      contextFor(agent)
    );
    expect(roleActions).toHaveLength(3);

    for (const action of [
      changeUserRole,
      changeUserAvatar,
      changeUserName,
      changeUserEmail,
      suspendUser,
      deleteUser,
      resendInvite,
      ...roleActions,
    ]) {
      expect(visible(action, agent)).toBe(false);
    }
    expect(visible(revokeInvite, invitedAgent)).toBe(false);
    expect(visible(activateUser, suspendedAgent)).toBe(false);
  });
});
