import type { PropertyDefinitionData } from "~/models/PropertyDefinition";
import type { DocumentPropertyValue } from "~/models/DocumentPropertyValue";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { AuthorizationError, ConflictError } from "~/utils/errors";
import { DocumentPropertiesStore } from "./DocumentPropertiesStore";

const documentId = "doc-1";

const status: PropertyDefinitionData = {
  id: "status",
  name: "Status",
  type: "singleSelect",
  owner: "workspace",
  access: "open",
  options: [{ id: "todo", label: "To do" }],
  key: null,
};

const due: PropertyDefinitionData = {
  id: "due",
  name: "Due date",
  type: "date",
  owner: "workspace",
  access: "open",
  options: [],
  key: null,
};

const source: PropertyDefinitionData = {
  id: "source",
  name: "Altai source",
  type: "url",
  owner: "altai",
  access: "managed",
  options: [],
  key: "altai.source",
};

type Handler = (params: Record<string, unknown>) => unknown;

const post = vi.mocked(client.post);

function route(handlers: Record<string, Handler>) {
  post.mockImplementation(async (path: string, params?: unknown) => {
    const handler = handlers[path];
    if (!handler) {
      throw new Error(`Unexpected request: ${path}`);
    }
    const body =
      params && typeof params === "object" && !(params instanceof FormData)
        ? Object.fromEntries(Object.entries(params))
        : {};
    return handler(body);
  });
}

function listResponse(
  values: DocumentPropertyValue[],
  definitions: PropertyDefinitionData[] = [status, due, source]
) {
  return { data: { definitions, values } };
}

function callsTo(path: string) {
  return post.mock.calls.filter(([called]) => called === path);
}

describe("DocumentPropertiesStore", () => {
  let store: DocumentPropertiesStore;

  beforeEach(() => {
    post.mockReset();
    store = new DocumentPropertiesStore(stores);
  });

  it("filters cleared tombstones out of the assigned values", async () => {
    route({
      "/documentProperties.list": () =>
        listResponse([
          { documentId, definitionId: "status", value: "todo", version: 2 },
          { documentId, definitionId: "due", value: null, version: 3 },
        ]),
    });

    await store.fetch(documentId);

    expect(
      store.assignedFor(documentId).map((item) => item.definition.id)
    ).toEqual(["status"]);
    expect(store.valueFor(documentId, "due")).toBeUndefined();
    expect(store.versionFor(documentId, "due")).toBe(3);
    expect(
      store.availableFor(documentId).map((definition) => definition.id)
    ).toEqual(["due"]);
    expect(store.definitionsFor(documentId).map((item) => item.name)).toEqual([
      "Altai source",
      "Due date",
      "Status",
    ]);
  });

  it("does not offer managed definitions to add", async () => {
    route({ "/documentProperties.list": () => listResponse([]) });
    await store.fetch(documentId);
    expect(
      store.availableFor(documentId).map((definition) => definition.id)
    ).not.toContain("source");
    expect(store.getDefinition("source")?.isManaged).toBe(true);
  });

  it("deduplicates concurrent fetches", async () => {
    route({ "/documentProperties.list": () => listResponse([]) });
    await Promise.all([store.fetch(documentId), store.fetch(documentId)]);
    expect(callsTo("/documentProperties.list")).toHaveLength(1);
  });

  it("sends version 0 on the first set and stores the new version", async () => {
    route({
      "/documentProperties.list": () => listResponse([]),
      "/documentProperties.set": (params) => ({
        data: { ...params, version: 1 },
      }),
    });
    await store.fetch(documentId);

    const result = await store.setValue(
      documentId,
      "due",
      "2026-11-13",
      store.versionFor(documentId, "due")
    );

    expect(callsTo("/documentProperties.set")[0][1]).toEqual({
      documentId,
      definitionId: "due",
      version: 0,
      value: "2026-11-13",
    });
    expect(result.status).toBe("saved");
    expect(store.valueFor(documentId, "due")?.value).toBe("2026-11-13");
    expect(store.versionFor(documentId, "due")).toBe(1);
  });

  it("sends the tombstone version when setting a cleared value", async () => {
    route({
      "/documentProperties.list": () =>
        listResponse([
          { documentId, definitionId: "due", value: null, version: 4 },
        ]),
      "/documentProperties.set": (params) => ({
        data: { ...params, version: 5 },
      }),
    });
    await store.fetch(documentId);
    await store.setValue(
      documentId,
      "due",
      "2026-11-14",
      store.versionFor(documentId, "due")
    );
    expect(callsTo("/documentProperties.set")[0][1]).toMatchObject({
      version: 4,
    });
  });

  it("clears without a value and keeps the tombstone version", async () => {
    route({
      "/documentProperties.list": () =>
        listResponse([
          { documentId, definitionId: "status", value: "todo", version: 2 },
        ]),
      "/documentProperties.clear": (params) => ({
        data: { ...params, value: null, version: 3 },
      }),
    });
    await store.fetch(documentId);

    await store.clearValue(
      documentId,
      "status",
      store.versionFor(documentId, "status")
    );

    expect(callsTo("/documentProperties.clear")[0][1]).toEqual({
      documentId,
      definitionId: "status",
      version: 2,
    });
    expect(store.valueFor(documentId, "status")).toBeUndefined();
    expect(store.assignedFor(documentId)).toEqual([]);
    expect(store.versionFor(documentId, "status")).toBe(3);
  });

  it("refetches on a conflict and reports it so the draft is kept", async () => {
    let listed = 0;
    route({
      "/documentProperties.list": () => {
        listed += 1;
        return listResponse(
          listed === 1
            ? [
                {
                  documentId,
                  definitionId: "status",
                  value: "todo",
                  version: 1,
                },
              ]
            : [{ documentId, definitionId: "status", value: null, version: 2 }]
        );
      },
      "/documentProperties.set": () => {
        throw new ConflictError(
          "This property changed. Reload its value before saving."
        );
      },
    });
    await store.fetch(documentId);

    const result = await store.setValue(documentId, "status", "todo", 1);

    expect(result).toEqual({ status: "conflict" });
    expect(listed).toBe(2);
    expect(store.hasConflict(documentId, "status")).toBe(true);
    expect(store.valueFor(documentId, "status")).toBeUndefined();
    expect(store.versionFor(documentId, "status")).toBe(2);
    expect(store.isSaving(documentId, "status")).toBe(false);

    store.dismissConflict(documentId, "status");
    expect(store.hasConflict(documentId, "status")).toBe(false);
  });

  it("retries a conflicting write with the refetched version", async () => {
    let listed = 0;
    let attempts = 0;
    route({
      "/documentProperties.list": () => {
        listed += 1;
        return listResponse([
          {
            documentId,
            definitionId: "status",
            value: "todo",
            version: listed,
          },
        ]);
      },
      "/documentProperties.set": (params) => {
        attempts += 1;
        if (attempts === 1) {
          throw new ConflictError("Conflict");
        }
        return { data: { ...params, version: 3 } };
      },
    });
    await store.fetch(documentId);

    await store.setValue(documentId, "status", "todo", 1);
    const result = await store.setValue(
      documentId,
      "status",
      "todo",
      store.versionFor(documentId, "status")
    );

    expect(result.status).toBe("saved");
    expect(callsTo("/documentProperties.set")[1][1]).toMatchObject({
      version: 2,
    });
    expect(store.hasConflict(documentId, "status")).toBe(false);
  });

  it("sends the base version even after a refresh changed it", async () => {
    let listed = 0;
    route({
      "/documentProperties.list": () => {
        listed += 1;
        return listResponse([
          {
            documentId,
            definitionId: "status",
            value: listed === 1 ? "todo" : "done",
            version: listed,
          },
        ]);
      },
      "/documentProperties.set": () => {
        throw new ConflictError("Conflict");
      },
    });
    const release = store.retain(documentId);
    await store.fetch(documentId);
    const baseVersion = store.versionFor(documentId, "status");

    await store.invalidate(documentId);
    expect(store.versionFor(documentId, "status")).toBe(2);
    expect(store.valueFor(documentId, "status")?.value).toBe("done");

    const result = await store.setValue(
      documentId,
      "status",
      "todo",
      baseVersion
    );

    expect(callsTo("/documentProperties.set")[0][1]).toMatchObject({
      version: 1,
    });
    expect(result).toEqual({ status: "conflict" });
    release();
  });

  it("clears with the base version even after a remote clear", async () => {
    let listed = 0;
    route({
      "/documentProperties.list": () => {
        listed += 1;
        return listResponse([
          {
            documentId,
            definitionId: "status",
            value: listed === 1 ? "todo" : null,
            version: listed,
          },
        ]);
      },
      "/documentProperties.clear": () => {
        throw new ConflictError("Conflict");
      },
    });
    const release = store.retain(documentId);
    await store.fetch(documentId);
    const baseVersion = store.versionFor(documentId, "status");
    await store.invalidate(documentId);
    expect(store.versionFor(documentId, "status")).toBe(2);
    expect(store.valueFor(documentId, "status")).toBeUndefined();

    const result = await store.clearValue(documentId, "status", baseVersion);

    expect(callsTo("/documentProperties.clear")[0][1]).toEqual({
      documentId,
      definitionId: "status",
      version: 1,
    });
    expect(result).toEqual({ status: "conflict" });
    release();
  });

  it("rethrows other write errors", async () => {
    route({
      "/documentProperties.list": () => listResponse([]),
      "/documentProperties.set": () => {
        throw new AuthorizationError("Forbidden");
      },
    });
    await store.fetch(documentId);
    await expect(
      store.setValue(documentId, "source", "https://a.b", 0)
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(store.hasConflict(documentId, "source")).toBe(false);
  });

  it("drops a document that the user can no longer read", async () => {
    let allowed = true;
    route({
      "/documentProperties.list": () => {
        if (!allowed) {
          throw new AuthorizationError("Forbidden");
        }
        return listResponse([]);
      },
    });
    const release = store.retain(documentId);
    await store.fetch(documentId);
    allowed = false;
    await store.invalidate(documentId);
    expect(store.isLoaded(documentId)).toBe(false);
    expect(store.fetchError(documentId)).toBeInstanceOf(AuthorizationError);
    release();
  });

  it("refetches retained documents on invalidate and evicts the rest", async () => {
    route({ "/documentProperties.list": () => listResponse([]) });
    const release = store.retain("doc-1");
    await store.fetch("doc-1");
    await store.fetch("doc-2");
    post.mockClear();

    await store.invalidate("doc-1");
    await store.invalidate("doc-2");

    expect(callsTo("/documentProperties.list").map((call) => call[1])).toEqual([
      { documentId: "doc-1" },
    ]);
    expect(store.isLoaded("doc-1")).toBe(true);
    expect(store.isLoaded("doc-2")).toBe(false);
    release();
  });

  it("refetches every retained document on invalidateAll", async () => {
    route({ "/documentProperties.list": () => listResponse([]) });
    const releaseOne = store.retain("doc-1");
    const releaseTwo = store.retain("doc-2");
    await store.fetch("doc-1");
    await store.fetch("doc-3");
    post.mockClear();

    await store.invalidateAll();

    expect(
      callsTo("/documentProperties.list")
        .map((call) => call[1])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    ).toEqual([{ documentId: "doc-1" }, { documentId: "doc-2" }]);
    expect(store.isLoaded("doc-3")).toBe(false);
    releaseOne();
    releaseTwo();
  });

  it("stops refetching a document once every retainer releases it", async () => {
    route({ "/documentProperties.list": () => listResponse([]) });
    const releaseOne = store.retain(documentId);
    const releaseTwo = store.retain(documentId);
    await store.fetch(documentId);
    releaseOne();
    releaseOne();
    post.mockClear();

    await store.invalidate(documentId);
    expect(callsTo("/documentProperties.list")).toHaveLength(1);

    releaseTwo();
    post.mockClear();
    await store.invalidate(documentId);
    expect(callsTo("/documentProperties.list")).toHaveLength(0);
    expect(store.isLoaded(documentId)).toBe(false);
  });

  it("offers a newly created definition on a loaded document", async () => {
    route({ "/documentProperties.list": () => listResponse([], [status]) });
    await store.fetch(documentId);

    store.addDefinition(due, documentId);

    expect(
      store.availableFor(documentId).map((definition) => definition.id)
    ).toEqual(["due", "status"]);
  });
});
