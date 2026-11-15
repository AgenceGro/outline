import type { PropertyDefinitionData } from "~/models/PropertyDefinition";
import { newPropertyOption } from "~/components/Properties/options";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { PropertyDefinitionsStore } from "./PropertyDefinitionsStore";

const post = vi.mocked(client.post);

function definition(
  overrides: Partial<PropertyDefinitionData> & { id: string; name: string }
): PropertyDefinitionData {
  return {
    type: "text",
    owner: "workspace",
    access: "open",
    options: [],
    key: null,
    ...overrides,
  };
}

describe("PropertyDefinitionsStore", () => {
  let store: PropertyDefinitionsStore;

  beforeEach(() => {
    post.mockReset();
    store = new PropertyDefinitionsStore(stores);
  });

  it("orders definitions by name and computes isManaged", async () => {
    post.mockResolvedValue({
      data: [
        definition({ id: "b", name: "Status", affectedDocumentCount: 4 }),
        definition({
          id: "a",
          name: "Altai source",
          owner: "altai",
          access: "managed",
          key: "altai.source",
        }),
      ],
    });

    const result = await store.fetchAll();

    expect(result.map((item) => item.name)).toEqual(["Altai source", "Status"]);
    expect(store.isLoaded).toBe(true);
    expect(store.get("a")?.isManaged).toBe(true);
    expect(store.get("b")?.isManaged).toBe(false);
    expect(store.get("b")?.affectedDocumentCount).toBe(4);
  });

  it("removes definitions that are no longer listed", async () => {
    post.mockResolvedValueOnce({
      data: [
        definition({ id: "a", name: "A" }),
        definition({ id: "b", name: "B" }),
      ],
    });
    await store.fetchAll();
    post.mockResolvedValueOnce({ data: [definition({ id: "a", name: "A" })] });
    await store.fetchAll({ force: true });
    expect(store.orderedData.map((item) => item.id)).toEqual(["a"]);
  });

  it("shares one request between concurrent fetches", async () => {
    post.mockResolvedValue({ data: [] });
    await Promise.all([store.fetchAll(), store.fetchAll()]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("only refetches after an invalidation when loaded", async () => {
    post.mockResolvedValue({ data: [] });
    await store.refetchIfLoaded();
    expect(post).not.toHaveBeenCalled();

    await store.fetchAll();
    await store.refetchIfLoaded();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("creates a definition with client generated option IDs", async () => {
    const option = newPropertyOption(" To do ");
    post.mockResolvedValueOnce({
      data: definition({
        id: "new",
        name: "Status",
        type: "singleSelect",
        options: [option],
      }),
    });

    const created = await store.createDefinition({
      name: "Status",
      type: "singleSelect",
      options: [option],
    });

    expect(option.label).toBe("To do");
    expect(post).toHaveBeenCalledWith("/propertyDefinitions.create", {
      name: "Status",
      type: "singleSelect",
      options: [
        {
          id: option.id,
          label: "To do",
          color: undefined,
          icon: undefined,
          retired: undefined,
        },
      ],
    });
    expect(store.get("new")).toBe(created);
    expect(store.isSaving).toBe(false);
  });

  it("keeps the affected document count when an update omits it", async () => {
    post.mockResolvedValueOnce({
      data: [definition({ id: "a", name: "A", affectedDocumentCount: 7 })],
    });
    await store.fetchAll();
    post.mockResolvedValueOnce({
      data: definition({ id: "a", name: "Renamed" }),
    });

    await store.updateDefinition({ id: "a", name: "Renamed" });

    expect(store.get("a")?.name).toBe("Renamed");
    expect(store.get("a")?.affectedDocumentCount).toBe(7);
  });

  it("removes a deleted definition", async () => {
    post.mockResolvedValueOnce({ data: [definition({ id: "a", name: "A" })] });
    await store.fetchAll();
    post.mockResolvedValueOnce({ success: true });

    await store.deleteDefinition("a");

    expect(post).toHaveBeenLastCalledWith("/propertyDefinitions.delete", {
      id: "a",
    });
    expect(store.get("a")).toBeUndefined();
  });
});
