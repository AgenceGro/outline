import stores from "~/stores";

describe("Collection model", () => {
  it("should initialize with data", () => {
    const collection = stores.collections.add({
      id: "123",
      name: "Engineering",
    });
    expect(collection.name).toBe("Engineering");
  });

  it("should show the translated name for a personal collection", () => {
    const collection = stores.collections.add({
      id: "456",
      name: "Renamed",
      ownerId: "user-id",
    });
    expect(collection.displayName).toBe("Personal");

    const shared = stores.collections.add({ id: "789", name: "Design" });
    expect(shared.displayName).toBe("Design");
  });

  it("should know when an agent manages the collection", () => {
    const managed = stores.collections.add({
      id: "managed-1",
      name: "Altai",
      managedBy: "altai",
    });
    const unmanaged = stores.collections.add({ id: "managed-2", name: "Ops" });

    expect(managed.isManaged).toBe(true);
    expect(unmanaged.isManaged).toBe(false);
  });

  it("should not add a document that is already in the collection", () => {
    const collection = stores.collections.add({
      id: "abc",
      name: "Personal",
      sort: { field: "title", direction: "asc" },
      documents: [],
    });
    const document = stores.documents.add({
      id: "doc-1",
      title: "Doc",
      path: "/doc/doc-1",
      collectionId: collection.id,
    });

    collection.addDocument(document);
    collection.addDocument(document);
    expect(collection.documents?.map((node) => node.id)).toEqual(["doc-1"]);
  });
});
