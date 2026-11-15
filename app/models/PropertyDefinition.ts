import { action, computed, makeObservable, observable } from "mobx";
import type {
  PropertyAccess,
  PropertyOption,
  PropertyOwner,
  PropertyType,
} from "@shared/types/documentProperties";

/** The shape of a property definition as returned by the API. */
export interface PropertyDefinitionData {
  id: string;
  name: string;
  type: PropertyType;
  owner: PropertyOwner;
  access: PropertyAccess;
  options: PropertyOption[];
  affectedDocumentCount?: number;
  key: string | null;
}

/**
 * A typed document property defined for the workspace, such as "Status" or
 * "Due date". Values are stored separately for each document.
 */
export class PropertyDefinition {
  /** The unique identifier of the definition. */
  @observable
  id = "";

  /** The display name of the property. */
  @observable
  name = "";

  /** The type of value the property holds. */
  @observable
  type: PropertyType = "text";

  /** Who owns the definition: the workspace, Altai, or Outline. */
  @observable
  owner: PropertyOwner = "workspace";

  /** Whether the definition is open, or managed by its owner and locked. */
  @observable
  access: PropertyAccess = "open";

  /** The choices for select properties, including retired ones. */
  @observable.ref
  options: PropertyOption[] = [];

  /** The number of documents with a value, when the API provides it. */
  @observable
  affectedDocumentCount?: number = undefined;

  /** A stable key for integrations, or null for workspace properties. */
  @observable
  key: string | null = null;

  constructor(data: PropertyDefinitionData) {
    makeObservable(this);
    this.updateData(data);
  }

  /** Whether the definition is managed by its owner and cannot be edited. */
  @computed
  get isManaged(): boolean {
    return this.access === "managed";
  }

  /** Whether the property offers a list of choices. */
  @computed
  get isSelect(): boolean {
    return this.type === "singleSelect" || this.type === "multiSelect";
  }

  /** The options that can be chosen for new values. */
  @computed
  get activeOptions(): PropertyOption[] {
    return this.options.filter((option) => !option.retired);
  }

  /**
   * Finds an option of the definition, including retired options.
   *
   * @param id the ID of the option.
   * @returns the option, if it exists.
   */
  getOption(id: string): PropertyOption | undefined {
    return this.options.find((option) => option.id === id);
  }

  /**
   * Applies data from the API to the definition.
   * The affected document count is only listed for admins, so it is kept
   * when a response does not include it.
   *
   * @param data the latest data for the definition.
   */
  @action
  updateData(data: PropertyDefinitionData) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.owner = data.owner;
    this.access = data.access;
    this.options = data.options ?? [];
    if (data.affectedDocumentCount !== undefined) {
      this.affectedDocumentCount = data.affectedDocumentCount;
    }
    this.key = data.key ?? null;
  }
}
