import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from "mobx";
import type { JSONObject } from "@shared/types";
import type {
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";
import naturalSort from "@shared/utils/naturalSort";
import type RootStore from "~/stores/RootStore";
import { CoalescedFetch } from "~/models/base/CoalescedFetch";
import {
  PropertyDefinition,
  type PropertyDefinitionData,
} from "~/models/PropertyDefinition";
import { client } from "~/utils/ApiClient";

/** Input for creating a property definition. */
export interface CreatePropertyDefinitionInput {
  name: string;
  type: PropertyType;
  options?: PropertyOption[];
}

/** Input for updating a property definition. */
export interface UpdatePropertyDefinitionInput {
  id: string;
  name?: string;
  options?: PropertyOption[];
}

/**
 * Serializes select options for an API request.
 *
 * @param options the options to serialize.
 * @returns the options as JSON.
 */
export function propertyOptionsToJSON(options: PropertyOption[]): JSONObject[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    color: option.color,
    icon: option.icon
      ? { kind: option.icon.kind, value: option.icon.value }
      : undefined,
    retired: option.retired,
  }));
}

/**
 * Holds the workspace's property definitions, as listed by the
 * `propertyDefinitions.list` endpoint.
 */
export class PropertyDefinitionsStore {
  /** Definitions keyed by ID. */
  @observable
  data = observable.map<string, PropertyDefinition>();

  /** Whether the list has been fetched at least once. */
  @observable
  isLoaded = false;

  /** Whether the list is being fetched. */
  @observable
  isFetching = false;

  /** Whether a definition is being created, updated, or deleted. */
  @observable
  isSaving = false;

  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable(this);
  }

  /** The definitions ordered by name. */
  @computed
  get orderedData(): PropertyDefinition[] {
    return naturalSort(Array.from(this.data.values()), "name");
  }

  /**
   * Gets a definition by ID.
   *
   * @param id the ID of the definition.
   * @returns the definition, if it is loaded.
   */
  get(id: string): PropertyDefinition | undefined {
    return this.data.get(id);
  }

  /**
   * Fetches every definition, replacing the loaded list. Concurrent calls
   * share one request.
   *
   * @param options.force whether the result must be requested after this call,
   * for example after an invalidation.
   * @returns the definitions ordered by name.
   */
  fetchAll = (options?: { force?: boolean }): Promise<PropertyDefinition[]> =>
    this.listFetch.run(this.requestAll, Boolean(options?.force));

  /**
   * Fetches the definitions again if they have been loaded, used when they
   * are invalidated or the realtime connection is restored.
   *
   * @returns a promise that resolves when the refetch is complete.
   */
  async refetchIfLoaded(): Promise<void> {
    if (!this.isLoaded && this.listFetch.isIdle) {
      return;
    }
    await this.fetchAll({ force: true });
  }

  /**
   * Creates a definition.
   *
   * @param input the name, type, and options of the definition.
   * @returns the created definition.
   */
  createDefinition = async (
    input: CreatePropertyDefinitionInput
  ): Promise<PropertyDefinition> =>
    this.save("/propertyDefinitions.create", {
      name: input.name,
      type: input.type,
      options: input.options ? propertyOptionsToJSON(input.options) : undefined,
    });

  /**
   * Updates the name or options of a definition.
   *
   * @param input the ID of the definition and the fields to change.
   * @returns the updated definition.
   */
  updateDefinition = async (
    input: UpdatePropertyDefinitionInput
  ): Promise<PropertyDefinition> =>
    this.save("/propertyDefinitions.update", {
      id: input.id,
      name: input.name,
      options: input.options ? propertyOptionsToJSON(input.options) : undefined,
    });

  /**
   * Deletes a definition, and with it every value of the property.
   *
   * @param id the ID of the definition.
   */
  deleteDefinition = async (id: string): Promise<void> => {
    this.setSaving(true);
    try {
      await client.post("/propertyDefinitions.delete", { id });
      this.remove(id);
    } finally {
      this.setSaving(false);
    }
  };

  /**
   * Adds or updates a definition from API data.
   *
   * @param data the definition data.
   * @returns the definition in the store.
   */
  @action
  add = (data: PropertyDefinitionData): PropertyDefinition => {
    const existing = this.data.get(data.id);
    if (existing) {
      existing.updateData(data);
      return existing;
    }
    const definition = new PropertyDefinition(data);
    this.data.set(definition.id, definition);
    return definition;
  };

  /**
   * Removes a definition from the store.
   *
   * @param id the ID of the definition.
   */
  @action
  remove(id: string) {
    this.data.delete(id);
  }

  /** Removes every definition from the store. */
  @action
  clear() {
    this.data.clear();
    this.isLoaded = false;
  }

  private listFetch = new CoalescedFetch<PropertyDefinition[]>();

  private requestAll = async (): Promise<PropertyDefinition[]> => {
    runInAction(() => {
      this.isFetching = true;
    });
    try {
      const res = await client.post<{ data: PropertyDefinitionData[] }>(
        "/propertyDefinitions.list",
        {}
      );
      return runInAction(() => {
        const items = res?.data ?? [];
        const ids = new Set(items.map((item) => item.id));
        Array.from(this.data.keys()).forEach((id) => {
          if (!ids.has(id)) {
            this.data.delete(id);
          }
        });
        items.forEach(this.add);
        this.isLoaded = true;
        return this.orderedData;
      });
    } finally {
      runInAction(() => {
        this.isFetching = false;
      });
    }
  };

  private save = async (
    path: string,
    params: JSONObject
  ): Promise<PropertyDefinition> => {
    this.setSaving(true);
    try {
      const res = await client.post<{ data: PropertyDefinitionData }>(
        path,
        params
      );
      if (!res?.data) {
        throw new Error("Property definition not returned");
      }
      return this.add(res.data);
    } finally {
      this.setSaving(false);
    }
  };

  @action
  private setSaving(value: boolean) {
    this.isSaving = value;
  }
}
