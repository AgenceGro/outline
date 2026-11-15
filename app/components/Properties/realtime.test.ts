import { createPropertyRealtimeHandlers } from "./realtime";

function setup() {
  const documentProperties = {
    invalidate: vi.fn(() => Promise.resolve()),
    invalidateAll: vi.fn(() => Promise.resolve()),
  };
  const propertyDefinitions = {
    refetchIfLoaded: vi.fn(() => Promise.resolve()),
  };
  const onError = vi.fn();
  const handlers = createPropertyRealtimeHandlers(
    { documentProperties, propertyDefinitions },
    onError
  );
  return { documentProperties, propertyDefinitions, onError, handlers };
}

describe("createPropertyRealtimeHandlers", () => {
  it("does not refetch on the first authentication", () => {
    const { handlers, documentProperties, propertyDefinitions } = setup();
    handlers.authenticated();
    expect(documentProperties.invalidateAll).not.toHaveBeenCalled();
    expect(propertyDefinitions.refetchIfLoaded).not.toHaveBeenCalled();
  });

  it("refetches everything loaded after a reconnect", () => {
    const { handlers, documentProperties, propertyDefinitions } = setup();
    handlers.authenticated();
    handlers.authenticated();
    handlers.authenticated();
    expect(documentProperties.invalidateAll).toHaveBeenCalledTimes(2);
    expect(propertyDefinitions.refetchIfLoaded).toHaveBeenCalledTimes(2);
  });

  it("refetches definitions and documents when definitions change", () => {
    const { handlers, documentProperties, propertyDefinitions } = setup();
    handlers.definitionsInvalidated();
    expect(propertyDefinitions.refetchIfLoaded).toHaveBeenCalledTimes(1);
    expect(documentProperties.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it("invalidates the document named by the event", () => {
    const { handlers, documentProperties } = setup();
    handlers.documentInvalidated({ documentId: "doc-1" });
    handlers.documentInvalidated({});
    handlers.documentInvalidated();
    expect(documentProperties.invalidate).toHaveBeenCalledTimes(1);
    expect(documentProperties.invalidate).toHaveBeenCalledWith("doc-1");
  });

  it("reports a failed definitions refetch", async () => {
    const { handlers, propertyDefinitions, onError } = setup();
    const error = new Error("Forbidden");
    propertyDefinitions.refetchIfLoaded.mockImplementationOnce(() =>
      Promise.reject(error)
    );
    handlers.definitionsInvalidated();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
