import { randomUUID } from "node:crypto";
import {
  CollectionPermission,
  DocumentPermission,
  UserRole,
} from "@shared/types";
import { manageAgentKey } from "@server/commands/agentKeys";
import { loadPublicShare } from "@server/commands/shareLoader";
import { createContext } from "@server/context";
import {
  ApiKey,
  Collection,
  Document,
  GroupUser,
  PropertyAuditEvent,
  Revision,
  Team,
  User,
} from "@server/models";
import {
  buildAdmin,
  buildCollection,
  buildAttachment,
  buildDocument,
  buildGroup,
  buildPersonalCollection,
  buildTeam,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { sequelize } from "@server/storage/database";

const server = getTestServer();
let createdTeams: number;
let teamId: string;
let admin: User;
let agent: User;
let managed: Collection;

beforeAll(async () => {
  const creations = await Promise.allSettled([buildTeam(), buildTeam()]);
  createdTeams = creations.filter(
    (result) => result.status === "fulfilled"
  ).length;
  const team = await Team.findOne({ rejectOnEmpty: true });
  teamId = team.id;
  admin = await buildAdmin({ teamId });
  agent = await User.findOne({
    where: { agent: "altai" },
    rejectOnEmpty: true,
  });
  managed = await Collection.findOne({
    where: { managedBy: "altai" },
    rejectOnEmpty: true,
  });
});

function rpc(actor: User | string, method: string, body: object = {}) {
  const path = "/api/" + method;
  return typeof actor === "string"
    ? server.post(path, {
        headers: { Authorization: "Bearer " + actor },
        body,
        redirect: "manual",
      })
    : server.post(path, actor, { body, redirect: "manual" });
}

it("protects singleton identity, human credentials and human seats", async () => {
  expect(createdTeams).toBe(1);
  await expect(buildTeam()).rejects.toThrow();
  await sequelize.query("SELECT provision_altai(:id)", {
    replacements: { id: teamId },
  });
  expect(await User.count({ where: { agent: "altai" } })).toBe(1);
  expect(await Collection.count({ where: { managedBy: "altai" } })).toBe(1);
  expect((await User.getCounts(teamId)).admins).toBe(
    await User.count({ where: { role: UserRole.Admin, agent: null, teamId } })
  );
  expect(() => agent.getSessionToken()).toThrow();
  expect(() => agent.getTransferToken()).toThrow();
  expect((await rpc(admin, "users.suspend", { id: agent.id })).status).toBe(
    403
  );
  expect(
    (await rpc(admin, "teams.create", { name: "Second instance" })).status
  ).toBe(403);
  for (const method of ["archive", "delete"]) {
    expect(
      (await rpc(admin, "collections." + method, { id: managed.id })).status
    ).toBe(403);
  }
  expect(
    (
      await rpc(admin, "collections.update", {
        id: managed.id,
        permission: null,
      })
    ).status
  ).toBe(400);
});

it("uses a revocable bearer key to discover, edit and administer private content without empowering human admins or legacy tokens", async () => {
  const owner = await buildUser({ teamId });
  const personal = await buildPersonalCollection(owner);
  const privateDoc = await buildDocument({
    teamId,
    userId: owner.id,
    collectionId: personal.id,
  });
  const needle = "Orchid" + randomUUID().slice(0, 8);
  const draft = await buildDocument({
    teamId,
    userId: owner.id,
    collectionId: null,
    title: needle,
    text: needle,
  });
  const humanKey = await ApiKey.create({
    userId: admin.id,
    name: "Human admin key",
  });
  const issued = await manageAgentKey({
    action: "issue",
    name: "Agent verification",
  });
  if (!("token" in issued) || !issued.token || !humanKey.value) {
    throw new Error("No test key issued");
  }
  const key = issued.token;
  const keyId = issued.id;
  expect(
    (await rpc(humanKey.value, "documents.info", { id: draft.id })).status
  ).toBe(403);
  expect(
    (await rpc(humanKey.value, "documents.info", { id: privateDoc.id })).status
  ).toBe(403);
  expect((await rpc(key, "users.suspend", { id: admin.id })).status).toBe(400);
  const privateCollection = await buildCollection({
    teamId,
    permission: null,
    sharing: true,
    createdById: owner.id,
  });
  expect(
    (
      await rpc(key, "shares.create", {
        collectionId: privateCollection.id,
        published: true,
      })
    ).status
  ).toBe(200);
  const result = await rpc(key, "documents.list");
  expect(result.status).toBe(200);
  expect(
    (await result.json()).data.map((doc: { id: string }) => doc.id)
  ).toEqual(expect.arrayContaining([draft.id, privateDoc.id]));
  const search = await rpc(key, "documents.search", { query: needle });
  expect((await search.json()).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        document: expect.objectContaining({ id: draft.id }),
      }),
    ])
  );
  expect(
    (
      await rpc(key, "documents.update", {
        id: draft.id,
        title: "Checked by Altai",
      })
    ).status
  ).toBe(200);
  expect(
    (await Document.findByPk(draft.id, { rejectOnEmpty: true }))
      .lastModifiedById
  ).toBe(agent.id);
  const rev = await Revision.createFromDocument(
    createContext({ user: owner }),
    draft
  );
  expect((await rpc(key, "revisions.info", { id: rev.id })).status).toBe(200);
  const attachment = await buildAttachment({
    teamId,
    userId: owner.id,
    documentId: draft.id,
    acl: "private",
  });
  expect(
    (await rpc(key, "attachments.redirect", { id: attachment.id })).status
  ).toBe(302);

  const files = await rpc(key, "attachments.list", { documentId: draft.id });
  expect(
    (await files.json()).data.map((file: { id: string }) => file.id)
  ).toContain(attachment.id);
  expect((await rpc(key, "auth.delete")).status).toBe(403);

  const person = await buildUser({ teamId });
  expect((await rpc(key, "users.suspend", { id: person.id })).status).toBe(200);
  expect((await rpc(admin, "apiKeys.delete", { id: keyId })).status).toBe(403);
  expect((await rpc(key, "apiKeys.create", { name: "Forbidden" })).status).toBe(
    403
  );
  expect(
    (await server.post("/api/documents.list", { body: { token: key } })).status
  ).toBe(401);
  const legacy = await (await rpc(admin, "altaiInstallation.enable")).json();
  expect(
    (
      await rpc(legacy.data.token, "documents.update", {
        id: draft.id,
        title: "Forbidden",
      })
    ).status
  ).toBe(401);
  const definition = await (
    await rpc(legacy.data.token, "propertyDefinitions.create", {
      name: "Agent status",
      key: "agent-" + randomUUID(),
      type: "text",
    })
  ).json();
  await rpc(admin, "altaiInstallation.disable");
  expect(
    (await rpc(legacy.data.token, "integrationDocuments.list")).status
  ).toBe(401);
  expect(
    (
      await rpc(key, "documentProperties.set", {
        documentId: privateDoc.id,
        definitionId: definition.data.id,
        version: 0,
        value: "Complete",
      })
    ).status
  ).toBe(200);
  expect((await privateDoc.reload()).lastModifiedById).toBe(owner.id);
  expect(
    await PropertyAuditEvent.count({
      where: { actorId: agent.id, documentId: privateDoc.id },
    })
  ).toBe(1);
  for (const operation of [
    "archive",
    "restore",
    "delete",
    "restore",
    "delete",
  ]) {
    expect(
      (await rpc(key, "documents." + operation, { id: privateDoc.id })).status,
      operation
    ).toBe(200);
  }
  expect(
    (await rpc(key, "documents.delete", { id: privateDoc.id, permanent: true }))
      .status
  ).toBe(200);
  const replacement = await manageAgentKey({
    action: "issue",
    name: "Rotation",
  });
  if (!("token" in replacement) || !replacement.token) {
    throw new Error("No replacement token");
  }
  expect(
    (await rpc(replacement.token, "documents.info", { id: draft.id })).status
  ).toBe(200);
  const replacementLegacy = await (
    await rpc(admin, "altaiInstallation.enable")
  ).json();
  await manageAgentKey({ action: "revoke", id: keyId });
  expect(
    (await rpc(replacementLegacy.data.token, "integrationDocuments.list"))
      .status
  ).toBe(200);
  expect((await rpc(key, "documents.info", { id: draft.id })).status).toBe(401);
  expect(
    (await rpc(replacement.token, "documents.info", { id: draft.id })).status
  ).toBe(200);
  await manageAgentKey({ action: "revoke", id: replacement.id });
});

it("keeps managed content internal and limits writing to granted subtrees", async () => {
  const guest = await buildUser({ teamId, role: UserRole.Guest });
  const viewer = await buildUser({ teamId, role: UserRole.Viewer });
  const member = await buildUser({ teamId });
  const create = async (
    actor: User,
    title: string,
    parentDocumentId?: string
  ) => {
    const res = await rpc(actor, "documents.create", {
      title,
      publish: true,
      collectionId: managed.id,
      parentDocumentId,
    });
    expect(res.status).toBe(200);
    return (await res.json()).data.id as string;
  };
  const parent = await create(admin, "Managed parent");
  const child = await create(admin, "Existing child", parent);
  const sibling = await create(admin, "Sibling");
  const draft = await buildDocument({
    teamId,
    userId: admin.id,
    collectionId: managed.id,
    publishedAt: null,
  });
  for (const reader of [member, guest, viewer]) {
    const list = await rpc(reader, "collections.list");
    expect((await list.json()).data.map((c: { id: string }) => c.id)).toContain(
      managed.id
    );
    const tree = await rpc(reader, "collections.documents", { id: managed.id });
    const nodes = JSON.stringify((await tree.json()).data);
    expect(nodes).toContain(child);
    expect(nodes).not.toContain(draft.id);
    const search = await rpc(reader, "documents.search", {
      query: "Existing child",
    });
    expect(
      (await search.json()).data.map(
        (hit: { document: { id: string } }) => hit.document.id
      )
    ).toContain(child);
    expect((await rpc(reader, "documents.info", { id: child })).status).toBe(
      200
    );
    expect((await rpc(reader, "documents.info", { id: draft.id })).status).toBe(
      403
    );
    expect(
      (await rpc(reader, "documents.update", { id: child, title: "Denied" }))
        .status
    ).toBe(403);
  }
  const write = DocumentPermission.ReadWrite;
  expect(
    (
      await rpc(admin, "documents.add_user", {
        id: parent,
        userId: guest.id,
        permission: write,
      })
    ).status
  ).toBe(200);
  const grandchild = await create(guest, "New grandchild", child);
  expect(
    (await rpc(guest, "documents.update", { id: grandchild, title: "Allowed" }))
      .status
  ).toBe(200);
  expect(
    (await rpc(guest, "documents.update", { id: sibling, title: "Denied" }))
      .status
  ).toBe(403);
  expect((await rpc(guest, "documents.delete", { id: child })).status).toBe(
    403
  );
  expect(
    (
      await rpc(guest, "documents.move", {
        id: child,
        parentDocumentId: sibling,
      })
    ).status
  ).toBe(403);
  expect(
    (
      await rpc(guest, "documents.add_user", {
        id: child,
        userId: member.id,
        permission: write,
      })
    ).status
  ).toBe(403);
  expect(
    (
      await rpc(admin, "documents.add_user", {
        id: child,
        userId: guest.id,
        permission: write,
      })
    ).status
  ).toBe(200);
  expect(
    (await rpc(admin, "documents.remove_user", { id: child, userId: guest.id }))
      .status
  ).toBe(200);
  expect(
    (
      await rpc(guest, "documents.update", {
        id: child,
        title: "Ancestor still grants access",
      })
    ).status
  ).toBe(200);
  const group = await buildGroup({ teamId, userId: admin.id });
  await GroupUser.create({
    groupId: group.id,
    userId: guest.id,
    createdById: admin.id,
  });
  expect(
    (
      await rpc(admin, "documents.add_group", {
        id: child,
        groupId: group.id,
        permission: write,
      })
    ).status
  ).toBe(200);
  expect(
    (
      await rpc(admin, "documents.remove_user", {
        id: parent,
        userId: guest.id,
      })
    ).status
  ).toBe(200);
  expect(
    (await rpc(guest, "documents.update", { id: parent, title: "Denied" }))
      .status
  ).toBe(403);
  expect(
    (
      await rpc(guest, "documents.update", {
        id: grandchild,
        title: "Independent group grant",
      })
    ).status
  ).toBe(200);
  expect(
    (
      await rpc(admin, "documents.move", {
        id: grandchild,
        parentDocumentId: sibling,
      })
    ).status
  ).toBe(200);
  expect(
    (
      await rpc(guest, "documents.update", {
        id: grandchild,
        title: "Grant no longer applies",
      })
    ).status
  ).toBe(403);
  expect(
    (
      await rpc(admin, "collections.add_user", {
        id: managed.id,
        userId: viewer.id,
        permission: CollectionPermission.ReadWrite,
      })
    ).status
  ).toBe(200);
  await create(viewer, "Viewer authors at root");
  expect((await rpc(viewer, "documents.archive", { id: parent })).status).toBe(
    403
  );
  expect(
    (await rpc(admin, "shares.create", { documentId: parent, published: true }))
      .status
  ).toBe(403);
  const external = await buildDocument({ teamId, userId: admin.id });
  const share = await (
    await rpc(admin, "shares.create", {
      documentId: external.id,
      published: true,
    })
  ).json();
  expect(share.data.id).toBeTruthy();
  expect(
    (
      await rpc(admin, "documents.move", {
        id: external.id,
        collectionId: managed.id,
      })
    ).status
  ).toBe(200);
  await expect(loadPublicShare({ id: share.data.id })).rejects.toThrow();
  expect(
    (await server.post("/api/documents.info", { body: { id: parent } })).status
  ).toBe(401);
});
