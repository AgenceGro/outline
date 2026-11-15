import { action, makeObservable, observable, runInAction } from "mobx";
import type { PropertyData } from "@shared/types/documentProperties";
import naturalSort from "@shared/utils/naturalSort";
import type RootStore from "~/stores/RootStore";
import { KeyedCoalescedFetch } from "~/models/base/CoalescedFetch";
import {
  type AssignedPropertyValue,
  type DocumentPropertyValue,
  isAssignedPropertyValue,
} from "~/models/DocumentPropertyValue";
import {
  PropertyDefinition,
  type PropertyDefinitionData,
} from "~/models/PropertyDefinition";
import { client } from "~/utils/ApiClient";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "~/utils/errors";

/** The result of writing a property value. */
export type PropertyWriteResult =
  | { status: "saved"; value: DocumentPropertyValue }
  | { status: "conflict" };

/** A property that has a value on a document. */
export interface AssignedDocumentProperty {
  definition: PropertyDefinition;
  value: AssignedPropertyValue;
}

/**
 * Holds the typed properties of documents, as listed by the
 * `documentProperties.list` endpoint. Definitions are taken from that response
 * rather than the admin-only `propertyDefinitions.list`.
 */
export class DocumentPropertiesStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable(this);
  }

  /**
   * Fetches the properties of a document. Concurrent calls share one request.
   *
   * @param documentId the ID of the document.
   * @param options.force whether the result must be requested after this call.
   * @returns a promise that resolves when the properties are loaded.
   */
  fetch = (documentId: string, options?: { force?: boolean }): Promise<void> =>
    this.fetches.run(
      documentId,
      () => this.request(documentId),
      Boolean(options?.force)
    );

  /**
   * Whether the properties of a document have been loaded.
   *
   * @param documentId the ID of the document.
   * @returns true if loaded.
   */
  isLoaded(documentId: string): boolean {
    return this.entries.has(documentId);
  }

  /**
   * The error from the last fetch of a document's properties, if it failed.
   *
   * @param documentId the ID of the document.
   * @returns the error, if any.
   */
  fetchError(documentId: string): Error | undefined {
    return this.errors.get(documentId);
  }

  /**
   * The definitions returned for a document, ordered by name: the assigned
   * ones, and for editors those that can be added.
   *
   * @param documentId the ID of the document.
   * @returns the definitions.
   */
  definitionsFor(documentId: string): PropertyDefinition[] {
    const entry = this.entries.get(documentId);
    if (!entry) {
      return [];
    }
    return naturalSort(
      entry.definitionIds
        .map((id) => this.definitions.get(id))
        .filter((definition): definition is PropertyDefinition =>
          Boolean(definition)
        ),
      "name"
    );
  }

  /**
   * A definition seen in any document response.
   *
   * @param definitionId the ID of the definition.
   * @returns the definition, if known.
   */
  getDefinition(definitionId: string): PropertyDefinition | undefined {
    return this.definitions.get(definitionId);
  }

  /**
   * The properties with a value on a document, ordered by name. Cleared
   * values are left out.
   *
   * @param documentId the ID of the document.
   * @returns the assigned properties.
   */
  assignedFor(documentId: string): AssignedDocumentProperty[] {
    const entry = this.entries.get(documentId);
    if (!entry) {
      return [];
    }
    return this.definitionsFor(documentId).flatMap((definition) => {
      const value = entry.values.get(definition.id);
      return value && isAssignedPropertyValue(value)
        ? [{ definition, value }]
        : [];
    });
  }

  /**
   * The definitions that can be added to a document: open and not assigned.
   *
   * @param documentId the ID of the document.
   * @returns the definitions ordered by name.
   */
  availableFor(documentId: string): PropertyDefinition[] {
    return this.definitionsFor(documentId).filter(
      (definition) =>
        !definition.isManaged && !this.valueFor(documentId, definition.id)
    );
  }

  /**
   * The value of a property on a document, unless it is unset or cleared.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   * @returns the value, if set.
   */
  valueFor(
    documentId: string,
    definitionId: string
  ): AssignedPropertyValue | undefined {
    const value = this.entries.get(documentId)?.values.get(definitionId);
    return value && isAssignedPropertyValue(value) ? value : undefined;
  }

  /**
   * The latest known version of a property, 0 when the property has never
   * had a value. Callers capture it when the user starts an edit and pass it
   * as the base version of the write, so a refresh in between is detected as
   * a conflict instead of being overwritten.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   * @returns the last known version.
   */
  versionFor(documentId: string, definitionId: string): number {
    return this.entries.get(documentId)?.values.get(definitionId)?.version ?? 0;
  }

  /**
   * Whether the last write of a property was rejected because it changed
   * elsewhere.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   * @returns true if there is an unresolved conflict.
   */
  hasConflict(documentId: string, definitionId: string): boolean {
    return this.conflicts.has(keyFor(documentId, definitionId));
  }

  /**
   * Forgets the conflict of a property, once the user has seen it.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   */
  @action
  dismissConflict(documentId: string, definitionId: string) {
    this.conflicts.delete(keyFor(documentId, definitionId));
  }

  /**
   * Whether a write of a property is in flight.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   * @returns true if saving.
   */
  isSaving(documentId: string, definitionId: string): boolean {
    return this.saving.has(keyFor(documentId, definitionId));
  }

  /**
   * Sets the value of a property on a document. A conflicting write refetches
   * the document's properties and resolves with a conflict, so the caller can
   * keep the user's draft.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   * @param value the new value.
   * @param baseVersion the version the user's edit is based on.
   * @returns the result of the write.
   * @throws if the write fails for another reason.
   */
  setValue = (
    documentId: string,
    definitionId: string,
    value: PropertyData,
    baseVersion: number
  ): Promise<PropertyWriteResult> =>
    this.write(
      "/documentProperties.set",
      documentId,
      definitionId,
      value,
      baseVersion
    );

  /**
   * Clears the value of a property on a document.
   *
   * @param documentId the ID of the document.
   * @param definitionId the ID of the definition.
   * @param baseVersion the version the user's edit is based on.
   * @returns the result of the write.
   * @throws if the write fails for another reason than a conflict.
   */
  clearValue = (
    documentId: string,
    definitionId: string,
    baseVersion: number
  ): Promise<PropertyWriteResult> =>
    this.write(
      "/documentProperties.clear",
      documentId,
      definitionId,
      null,
      baseVersion
    );

  /**
   * Marks a document's properties as in use, so they are refetched when
   * invalidated or after a reconnect.
   *
   * @param documentId the ID of the document.
   * @returns a function that releases the document.
   */
  retain(documentId: string): () => void {
    this.retained.set(documentId, (this.retained.get(documentId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const count = (this.retained.get(documentId) ?? 1) - 1;
      if (count > 0) {
        this.retained.set(documentId, count);
      } else {
        this.retained.delete(documentId);
      }
    };
  }

  /**
   * Handles an invalidation of a document's properties: documents in use are
   * refetched, others are dropped so they load fresh when next shown.
   *
   * @param documentId the ID of the document.
   * @returns a promise that resolves when any refetch is complete.
   */
  async invalidate(documentId: string): Promise<void> {
    if (this.retained.has(documentId)) {
      await this.fetch(documentId, { force: true }).catch(() => undefined);
      return;
    }
    this.evict(documentId);
  }

  /**
   * Invalidates the properties of every loaded document, used when
   * definitions change or the realtime connection is restored.
   *
   * @returns a promise that resolves when the refetches are complete.
   */
  async invalidateAll(): Promise<void> {
    const ids = new Set([...this.entries.keys(), ...this.retained.keys()]);
    await Promise.all(Array.from(ids).map((id) => this.invalidate(id)));
  }

  /**
   * Adds a definition to the store, and optionally offers it on a document,
   * for example right after an admin creates it from the document.
   *
   * @param data the definition data.
   * @param documentId the ID of a loaded document to offer it on.
   */
  @action
  addDefinition(data: PropertyDefinitionData, documentId?: string) {
    const existing = this.definitions.get(data.id);
    if (existing) {
      existing.updateData(data);
    } else {
      this.definitions.set(data.id, new PropertyDefinition(data));
    }

    const entry = documentId ? this.entries.get(documentId) : undefined;
    if (documentId && entry && !entry.definitionIds.includes(data.id)) {
      this.entries.set(documentId, {
        ...entry,
        definitionIds: [...entry.definitionIds, data.id],
      });
    }
  }

  /** Removes every loaded document from the store. */
  @action
  clear() {
    this.entries.clear();
    this.definitions.clear();
    this.conflicts.clear();
    this.errors.clear();
  }

  /** Definitions seen in document responses, keyed by ID. */
  private definitions = observable.map<string, PropertyDefinition>();

  private entries = observable.map<string, DocumentPropertiesEntry>(undefined, {
    deep: false,
  });

  private errors = observable.map<string, Error>(undefined, { deep: false });

  private conflicts = observable.map<string, true>();

  private saving = observable.map<string, true>();

  private retained = new Map<string, number>();

  private fetches = new KeyedCoalescedFetch<void>();

  private request = async (documentId: string): Promise<void> => {
    try {
      const res = await client.post<ListResponse>("/documentProperties.list", {
        documentId,
      });
      runInAction(() => {
        const definitions = res?.data?.definitions ?? [];
        const values = res?.data?.values ?? [];
        definitions.forEach((data) => this.addDefinition(data));
        this.entries.set(documentId, {
          definitionIds: definitions.map((data) => data.id),
          values: new Map(values.map((value) => [value.definitionId, value])),
        });
        this.errors.delete(documentId);
      });
    } catch (err) {
      runInAction(() => {
        if (err instanceof AuthorizationError || err instanceof NotFoundError) {
          this.entries.delete(documentId);
        }
        if (err instanceof Error) {
          this.errors.set(documentId, err);
        }
      });
      throw err;
    }
  };

  private write = async (
    path: string,
    documentId: string,
    definitionId: string,
    value: PropertyData | null,
    version: number
  ): Promise<PropertyWriteResult> => {
    const key = keyFor(documentId, definitionId);
    runInAction(() => {
      this.saving.set(key, true);
    });

    try {
      const res = await client.post<{ data: DocumentPropertyValue }>(path, {
        documentId,
        definitionId,
        version,
        ...(value === null ? {} : { value }),
      });
      const saved = res?.data ?? { documentId, definitionId, value, version };
      runInAction(() => {
        this.conflicts.delete(key);
        this.applyValue(saved);
      });
      return { status: "saved", value: saved };
    } catch (err) {
      if (!(err instanceof ConflictError)) {
        throw err;
      }
      runInAction(() => {
        this.conflicts.set(key, true);
      });
      await this.fetch(documentId, { force: true }).catch(() => undefined);
      return { status: "conflict" };
    } finally {
      runInAction(() => {
        this.saving.delete(key);
      });
    }
  };

  @action
  private applyValue(value: DocumentPropertyValue) {
    const entry = this.entries.get(value.documentId);
    if (!entry) {
      return;
    }
    const values = new Map(entry.values);
    values.set(value.definitionId, value);
    this.entries.set(value.documentId, {
      definitionIds: entry.definitionIds.includes(value.definitionId)
        ? entry.definitionIds
        : [...entry.definitionIds, value.definitionId],
      values,
    });
  }

  @action
  private evict(documentId: string) {
    this.entries.delete(documentId);
    this.errors.delete(documentId);
  }
}

function keyFor(documentId: string, definitionId: string) {
  return `${documentId}:${definitionId}`;
}

/** The loaded properties of one document, replaced as a whole on change. */
interface DocumentPropertiesEntry {
  /** IDs of the definitions returned for the document. */
  definitionIds: string[];
  /** Values keyed by definition ID, including cleared tombstones. */
  values: Map<string, DocumentPropertyValue>;
}

interface ListResponse {
  data: {
    definitions: PropertyDefinitionData[];
    values: DocumentPropertyValue[];
  };
}
