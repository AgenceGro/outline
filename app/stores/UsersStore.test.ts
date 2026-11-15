import { CollectionPermission } from "@shared/types";
import type User from "~/models/User";
import stores from "~/stores";

describe("UsersStore", () => {
  let person: User;
  let agent: User;

  beforeAll(() => {
    // Signed-out auth hydration leaves an empty user in the store, which
    // can't be ordered by name.
    stores.users.clear();
    person = stores.users.add({
      id: "a1111111-1111-4111-8111-111111111111",
      name: "Ada",
      email: "ada@example.com",
    });
    agent = stores.users.add({
      id: "a2222222-2222-4222-8222-222222222222",
      name: "Altai",
      email: "altai@example.com",
      agent: "altai",
    });
  });

  const ids = (users: { id: string }[]) => users.map((user) => user.id);

  it("keeps agents in all users, so their work stays attributed", () => {
    expect(ids(stores.users.all)).toEqual(
      expect.arrayContaining([person.id, agent.id])
    );
  });

  it("leaves agents out of people", () => {
    expect(ids(stores.users.people)).toContain(person.id);
    expect(ids(stores.users.people)).not.toContain(agent.id);
  });

  it("never offers agents when granting access", () => {
    const collection = stores.collections.add({
      id: "c1111111-1111-4111-8111-111111111111",
      name: "Engineering",
    });
    const document = stores.documents.add({
      id: "d1111111-1111-4111-8111-111111111111",
      title: "Plan",
      collectionId: collection.id,
    });
    const group = stores.groups.add({
      id: "e1111111-1111-4111-8111-111111111111",
      name: "Ops",
    });

    for (const offered of [
      stores.users.notInCollection(collection.id),
      stores.users.notInDocument(document.id),
      stores.users.notInGroup(group.id),
    ]) {
      expect(ids(offered)).toContain(person.id);
      expect(ids(offered)).not.toContain(agent.id);
    }
  });

  it("leaves agents out of the people in a collection", () => {
    const collectionId = "c2222222-2222-4222-8222-222222222222";
    stores.collections.add({ id: collectionId, name: "Managed" });
    for (const user of [person, agent]) {
      stores.memberships.add({
        id: `${user.id.slice(0, 8)}-0000-4000-8000-000000000000`,
        collectionId,
        userId: user.id,
        permission: CollectionPermission.ReadWrite,
      });
    }

    expect(ids(stores.users.inCollection(collectionId))).toEqual([person.id]);
  });
});
