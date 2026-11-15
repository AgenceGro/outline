import type { DocumentPropertiesStore } from "~/stores/DocumentPropertiesStore";
import type { PropertyDefinitionsStore } from "~/stores/PropertyDefinitionsStore";

/** Handlers for the realtime events that concern typed properties. */
export interface PropertyRealtimeHandlers {
  /** Handles a socket authentication; every one after the first is a reconnect. */
  authenticated: () => void;
  /** Handles `propertyDefinitions.invalidate`. */
  definitionsInvalidated: () => void;
  /** Handles `documentProperties.invalidate`. */
  documentInvalidated: (event?: { documentId?: string }) => void;
}

/**
 * Creates the handlers that keep typed properties current. An invalidation
 * refetches what is loaded, and so does a reconnect, as events may have been
 * missed while disconnected.
 *
 * @param stores the property stores.
 * @param stores.documentProperties the store of document properties.
 * @param stores.propertyDefinitions the store of workspace definitions.
 * @param onError called when refetching the definitions fails.
 * @returns the handlers.
 */
export function createPropertyRealtimeHandlers(
  stores: {
    documentProperties: Pick<
      DocumentPropertiesStore,
      "invalidate" | "invalidateAll"
    >;
    propertyDefinitions: Pick<PropertyDefinitionsStore, "refetchIfLoaded">;
  },
  onError?: (err: unknown) => void
): PropertyRealtimeHandlers {
  let hasAuthenticated = false;

  const refetchAll = () => {
    void stores.propertyDefinitions.refetchIfLoaded().catch((err) => {
      onError?.(err);
    });
    void stores.documentProperties.invalidateAll();
  };

  return {
    authenticated: () => {
      if (hasAuthenticated) {
        refetchAll();
      }
      hasAuthenticated = true;
    },
    definitionsInvalidated: refetchAll,
    documentInvalidated: (event) => {
      if (event?.documentId) {
        void stores.documentProperties.invalidate(event.documentId);
      }
    },
  };
}
