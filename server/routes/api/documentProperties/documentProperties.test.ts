import { ForeignKeyConstraintError } from "sequelize";
import { DocumentProperties } from "@server/commands/documentProperties";
import {
  Document,
  DocumentPropertyValue,
  PropertyAuditEvent,
} from "@server/models";
import { sequelize } from "@server/storage/database";
import {
  buildAdmin,
  buildDocument,
  buildEmoji,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import type {
  PropertyData,
  PropertyType,
} from "@shared/types/documentProperties";
import { UserRole, DocumentPermission } from "@shared/types";
import { UserMembership } from "@server/models";

const server = getTestServer();

function external(token: string, method: string, body: object = {}) {
  return server.post("/api/" + method, {
    headers: { Authorization: "Bearer " + token },
    body,
  });
}

it("updates a private draft as Altai, resolves badge metadata live, and never edits the prose", async () => {
  const admin = await buildAdmin();
  const teamId = admin.teamId;
  const author = await buildUser({ teamId });
  const draft = await buildDocument({
    teamId,
    userId: author.id,
    collectionId: null,
  });
  const before = draft.updatedAt;
  const other = await buildDocument();
  const {
    data: { token },
  } = await (
    await server.post("/api/altaiInstallation.enable", admin, { body: {} })
  ).json();
  expect((await external(token, "integrationDocuments.list")).status).toBe(200);
  const enumeration = await (
    await external(token, "integrationDocuments.list")
  ).json();
  expect(enumeration.data.map((d: { id: string }) => d.id)).toEqual([draft.id]);
  expect(
    (
      await (
        await external(token, "integrationDocuments.info", { id: draft.id })
      ).json()
    ).data.content
  ).toEqual(draft.content);
  expect(
    (await external(token, "integrationDocuments.info", { id: other.id }))
      .status
  ).toBe(404);
  expect(
    (
      await external(token, "documents.update", {
        id: draft.id,
        title: "Forbidden",
      })
    ).status
  ).toBe(401);
  const option = {
    id: "ready",
    label: "Ready",
    color: "#009942",
    icon: { kind: "builtin", value: "done" },
  };
  const schema = {
    name: "Project status",
    key: "project_status",
    type: "singleSelect",
    options: [option],
  };
  const created = await external(token, "propertyDefinitions.create", schema);
  expect(created.status).toBe(200);
  const { data: definition } = await created.json();
  expect(
    (await (await external(token, "propertyDefinitions.create", schema)).json())
      .data.id
  ).toBe(definition.id);
  const pair = { documentId: draft.id, definitionId: definition.id };
  const body = { ...pair, version: 0, value: "ready" };
  expect((await external(token, "documentProperties.set", body)).status).toBe(
    200
  );
  expect(
    (
      await server.post("/api/documentProperties.clear", author, {
        body: { ...pair, version: 1 },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await server.post("/api/propertyDefinitions.update", admin, {
        body: { id: definition.id, access: "open" },
      })
    ).status
  ).toBe(403);
  const emoji = await buildEmoji({ teamId });
  const newOption = {
    ...option,
    shimmer: true,
    icon: { kind: "emoji", value: emoji.id },
  };
  expect(
    (
      await external(token, "propertyDefinitions.update", {
        id: definition.id,
        options: [newOption],
      })
    ).status
  ).toBe(200);
  const { data } = await (
    await server.post("/api/documentProperties.list", author, {
      body: { documentId: draft.id },
    })
  ).json();
  expect(data.definitions[0].options).toEqual([newOption]);
  expect(
    (
      await external(token, "propertyDefinitions.create", {
        ...schema,
        key: "invalid-shimmer",
        type: "multiSelect",
        options: [{ id: "ready", label: "Ready", shimmer: true }],
      })
    ).status
  ).toBe(400);
  expect(data.values).toEqual([{ ...pair, version: 1, value: "ready" }]);
  const foreignEmoji = await buildEmoji();
  for (const icon of [
    { kind: "emoji", value: foreignEmoji.id },
    { kind: "builtin", value: "notAnOutlineIcon" },
  ]) {
    expect(
      (
        await external(token, "propertyDefinitions.update", {
          id: definition.id,
          options: [{ ...option, icon }],
        })
      ).status
    ).toBe(400);
  }
  expect(
    (
      await external(token, "propertyDefinitions.update", {
        id: definition.id,
        options: [],
      })
    ).status
  ).toBe(200);
  const { data: retired } = await (
    await server.post("/api/documentProperties.list", author, {
      body: { documentId: draft.id },
    })
  ).json();
  expect(retired.definitions[0].options).toEqual([
    { ...newOption, retired: true },
  ]);
  expect(retired.values).toEqual([{ ...pair, version: 1, value: "ready" }]);
  expect(
    (await external(token, "documentProperties.clear", { ...pair, version: 0 }))
      .status
  ).toBe(409);
  expect(
    (await external(token, "documentProperties.clear", { ...pair, version: 1 }))
      .status
  ).toBe(200);
  expect(
    (await external(token, "documentProperties.set", { ...body, version: 2 }))
      .status
  ).toBe(400);
  expect(
    await PropertyAuditEvent.count({
      where: { teamId, action: "set", actorType: "installation" },
    })
  ).toBe(1);
  const fresh = await Document.findByPk(draft.id, { rejectOnEmpty: true });
  expect(fresh.updatedAt).toEqual(before);
  expect(fresh.lastModifiedById).toBe(author.id);
  expect(fresh.revisionCount).toBe(draft.revisionCount);
  const rotated = await (
    await server.post("/api/altaiInstallation.rotate", admin, { body: {} })
  ).json();
  expect((await external(token, "integrationDocuments.list")).status).toBe(401);
  expect(
    (
      await external(rotated.data.token, "integrationDocuments.info", {
        id: draft.id,
      })
    ).status
  ).toBe(200);
  const withoutIcon = {
    id: option.id,
    label: option.label,
    color: option.color,
  };
  await external(rotated.data.token, "propertyDefinitions.update", {
    id: definition.id,
    options: [withoutIcon],
  });
  expect(
    (
      await external(rotated.data.token, "documentProperties.set", {
        ...body,
        version: 2,
      })
    ).status
  ).toBe(200);
  await server.post("/api/altaiInstallation.disable", admin, { body: {} });
  expect(
    (await external(rotated.data.token, "integrationDocuments.list")).status
  ).toBe(401);
  const { data: preserved } = await (
    await server.post("/api/documentProperties.list", author, {
      body: { documentId: draft.id },
    })
  ).json();
  expect(preserved.definitions[0].options).toEqual([withoutIcon]);
  expect(preserved.values).toEqual([{ ...pair, version: 3, value: "ready" }]);
});

it("validates each type, serializes competing first writes and retains versions after clearing", async () => {
  const admin = await buildAdmin();
  const teamId = admin.teamId;
  const doc = await buildDocument({
    teamId,
    userId: admin.id,
    collectionId: null,
  });
  const fields: [PropertyType, PropertyData, PropertyData][] = [
    ["checkbox", false, 0],
    ["number", 0, "0"],
    ["text", "", false],
    ["date", "2024-02-29", "2025-02-29"],
    ["url", "https://example.com", "plain text"],
    ["textList", ["one", "two"], "one"],
    ["singleSelect", "one", "missing"],
    ["multiSelect", ["one"], ["one", "one"]],
  ];
  for (const [type, value, invalid] of fields) {
    const { data } = await (
      await server.post("/api/propertyDefinitions.create", admin, {
        body: {
          type,
          name: type,
          options: type.endsWith("Select") ? [{ id: "one", label: "One" }] : [],
        },
      })
    ).json();
    const pair = { definitionId: data.id, documentId: doc.id };
    expect(
      (
        await server.post("/api/documentProperties.set", admin, {
          body: { ...pair, value: invalid, version: 0 },
        })
      ).status
    ).toBe(400);
    const write = () =>
      server.post("/api/documentProperties.set", admin, {
        body: { ...pair, value, version: 0 },
      });
    const writes = await Promise.all([write(), write()]);
    expect(writes.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(
      (
        await server.post("/api/documentProperties.clear", admin, {
          body: { ...pair, version: 1 },
        })
      ).status
    ).toBe(200);
    expect((await write()).status).toBe(409);
    expect(
      (
        await DocumentPropertyValue.findOne({
          where: pair,
          rejectOnEmpty: true,
        })
      ).value
    ).toBe(null);
  }
  const { data: definitions } = await (
    await server.post("/api/propertyDefinitions.list", admin, { body: {} })
  ).json();
  expect(
    definitions.map(
      (d: { affectedDocumentCount: number }) => d.affectedDocumentCount
    )
  ).toEqual(Array(8).fill(0));
}, 30000);

it("keeps internal ownership inaccessible over HTTP and enforces document access for guests", async () => {
  const admin = await buildAdmin();
  const teamId = admin.teamId;
  const guest = await buildUser({ teamId, role: UserRole.Guest });
  const doc = await buildDocument({
    teamId,
    userId: admin.id,
    collectionId: null,
  });
  const definition = await sequelize.transaction(async (transaction) => {
    const service = new DocumentProperties(
      { kind: "outline", teamId },
      transaction
    );
    const d = await service.create({
      name: "Internal",
      key: "internal",
      type: "text",
    });
    await service.write(doc.id, d.id, 0, "Assigned");
    return d;
  });
  expect(
    (
      await server.post("/api/documentProperties.list", guest, {
        body: { documentId: doc.id },
      })
    ).status
  ).toBe(403);
  await UserMembership.create({
    createdById: admin.id,
    userId: guest.id,
    documentId: doc.id,
    permission: DocumentPermission.Read,
  });
  const { data } = await (
    await server.post("/api/documentProperties.list", guest, {
      body: { documentId: doc.id },
    })
  ).json();
  expect(data.definitions.map((d: { id: string }) => d.id)).toEqual([
    definition.id,
  ]);
  expect(
    (
      await server.post("/api/documentProperties.set", guest, {
        body: {
          definitionId: definition.id,
          documentId: doc.id,
          value: "other",
          version: 1,
        },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await server.post("/api/propertyDefinitions.delete", admin, {
        body: { id: definition.id },
      })
    ).status
  ).toBe(403);
  expect(
    (await server.post("/api/altaiInstallation.enable", guest, { body: {} }))
      .status
  ).toBe(403);
});

it("separates clearing a value from deleting a definition and preserves counts and installation ownership", async () => {
  const admin = await buildAdmin();
  const teamId = admin.teamId;
  const doc = await buildDocument({
    teamId,
    userId: admin.id,
    collectionId: null,
  });
  const {
    data: { token },
  } = await (
    await server.post("/api/altaiInstallation.enable", admin, { body: {} })
  ).json();
  const { data: def } = await (
    await external(token, "propertyDefinitions.create", {
      key: "review_notes",
      type: "text",
      name: "Review notes",
      access: "open",
    })
  ).json();
  const pair = { documentId: doc.id, definitionId: def.id };
  expect(
    (
      await server.post("/api/documentProperties.set", admin, {
        body: { ...pair, version: 0, value: "Ready" },
      })
    ).status
  ).toBe(200);
  expect(
    (
      await external(token, "documentProperties.set", {
        ...pair,
        version: 1,
        value: "Reviewed",
      })
    ).status
  ).toBe(200);
  const { data: definitions } = await (
    await server.post("/api/propertyDefinitions.list", admin, { body: {} })
  ).json();
  expect(definitions).toMatchObject([{ id: def.id, affectedDocumentCount: 1 }]);
  expect(
    (
      await server.post("/api/propertyDefinitions.delete", admin, {
        body: { id: def.id },
      })
    ).status
  ).toBe(403);
  expect(
    (await external(token, "propertyDefinitions.delete", { id: def.id })).status
  ).toBe(200);
  expect(await DocumentPropertyValue.count({ where: pair })).toBe(0);
});

it("paginates private and archived documents, forbids archived writes, and excludes trash", async () => {
  const admin = await buildAdmin();
  const teamId = admin.teamId;
  const owner = await buildUser({ teamId });
  const first = await buildDocument({
    teamId,
    userId: owner.id,
    collectionId: null,
  });
  const archived = await buildDocument({
    teamId,
    userId: owner.id,
    archivedAt: new Date(),
  });
  const trashed = await buildDocument({
    teamId,
    userId: owner.id,
    deletedAt: new Date(),
  });
  const {
    data: { token },
  } = await (
    await server.post("/api/altaiInstallation.enable", admin, { body: {} })
  ).json();
  const { data: definition } = await (
    await external(token, "propertyDefinitions.create", {
      key: "status",
      name: "Status",
      type: "text",
    })
  ).json();
  const ids = await Promise.all(
    [0, 1].map(async (offset) => {
      const response = await external(token, "integrationDocuments.list", {
        limit: 1,
        offset,
      });
      const { data, pagination } = await response.json();
      expect(pagination.total).toBe(2);
      return data[0].id;
    })
  );
  expect(new Set(ids)).toEqual(new Set([first.id, archived.id]));
  expect(
    (await external(token, "integrationDocuments.info", { id: archived.id }))
      .status
  ).toBe(200);
  expect(
    (
      await external(token, "documentProperties.set", {
        documentId: archived.id,
        definitionId: definition.id,
        value: "changed",
        version: 0,
      })
    ).status
  ).toBe(403);
  expect(
    (await external(token, "integrationDocuments.info", { id: trashed.id }))
      .status
  ).toBe(404);
  expect(
    (
      await server.post("/api/integrationDocuments.info", admin, {
        body: { id: first.id },
      })
    ).status
  ).toBe(403);
});

it("provisions a provider key once under concurrency and rejects mixed-workspace assignments in PostgreSQL", async () => {
  const admin = await buildAdmin();
  const {
    data: { token },
  } = await (
    await server.post("/api/altaiInstallation.enable", admin, { body: {} })
  ).json();
  const create = () =>
    external(token, "propertyDefinitions.create", {
      name: "Provider reference",
      key: "record",
      type: "text",
    });
  const responses = await Promise.all([create(), create()]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  const [first, second] = await Promise.all(responses.map((r) => r.json()));
  expect(first.data.id).toBe(second.data.id);
  const other = await buildDocument();
  const mismatched = {
    teamId: admin.teamId,
    documentId: other.id,
    definitionId: first.data.id,
  };
  await expect(
    DocumentPropertyValue.create({ ...mismatched, value: "other", version: 1 })
  ).rejects.toBeInstanceOf(ForeignKeyConstraintError);
  expect(
    (
      await external(token, "documentProperties.set", {
        ...mismatched,
        value: "other",
        version: 0,
      })
    ).status
  ).toBe(404);
});
