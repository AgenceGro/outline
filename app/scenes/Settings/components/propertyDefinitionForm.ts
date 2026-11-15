import type {
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";

/** An editable copy of a property definition, held by the form. */
export interface PropertyDefinitionDraft {
  name: string;
  type: PropertyType;
  options: PropertyOption[];
  /** Ids of options already saved on the server; they can be retired, not removed. */
  savedOptionIds: string[];
}

/** The persisted fields of a definition that the form edits. */
export interface EditablePropertyDefinition {
  id: string;
  name: string;
  type: PropertyType;
  options: PropertyOption[];
}

/** Events that change a draft. */
export type PropertyDefinitionDraftEvent =
  | { type: "nameChanged"; name: string }
  | { type: "typeChanged"; propertyType: PropertyType }
  | { type: "optionAdded"; option: PropertyOption }
  | { type: "optionLabelChanged"; id: string; label: string }
  | { type: "optionColorChanged"; id: string; color: string | undefined }
  | {
      type: "optionIconChanged";
      id: string;
      icon: PropertyOption["icon"] | undefined;
    }
  | { type: "optionShimmerChanged"; id: string; shimmer: boolean }
  | { type: "optionRetired"; id: string }
  | { type: "optionRestored"; id: string }
  | { type: "optionRemoved"; id: string }
  | { type: "optionMoved"; id: string; offset: -1 | 1 }
  | { type: "reset"; draft: PropertyDefinitionDraft };

/** Validation failures, as codes the form translates. */
export interface PropertyDefinitionErrors {
  name?: "required" | "tooLong";
  /** A non-blocking notice that another property already uses the name. */
  nameWarning?: "duplicate";
  /** Too many options for the server limit. */
  options?: "tooMany";
  /** Label errors keyed by option id. */
  optionLabels: Record<string, "required" | "tooLong" | "duplicate">;
}

/** Server limits for definition fields. */
export const propertyDefinitionLimits = {
  name: 150,
  optionLabel: 100,
  options: 200,
} as const;

/** Request body for propertyDefinitions.create. */
export interface CreatePropertyDefinitionInput {
  name: string;
  type: PropertyType;
  options?: PropertyOption[];
}

/** Request body for propertyDefinitions.update. */
export interface UpdatePropertyDefinitionInput {
  id: string;
  name?: string;
  options?: PropertyOption[];
}

/** Where a server validation error belongs in the form. */
export interface ServerFieldError {
  field: "name" | "options" | null;
  message: string;
}

/**
 * Whether a property type has a list of options.
 *
 * @param type the property type.
 * @returns true for single and multi select.
 */
export function hasOptions(type: PropertyType): boolean {
  return type === "singleSelect" || type === "multiSelect";
}

/**
 * Whether options of a property type can show an icon.
 *
 * @param type the property type.
 * @returns true for single select only.
 */
export function supportsOptionIcons(type: PropertyType): boolean {
  return type === "singleSelect";
}

/**
 * Whether option labels of a property type can shimmer.
 *
 * @param type the property type.
 * @returns true for single select only.
 */
export function supportsOptionShimmer(type: PropertyType): boolean {
  return type === "singleSelect";
}

/**
 * Normalizes a color to the six digit lowercase hex form the server accepts.
 * Short hex is expanded and any alpha digits are dropped, so colors are saved
 * opaque; named and functional colors are refused.
 *
 * @param value the color from a picker or input.
 * @returns the normalized color, or undefined when it cannot be represented.
 */
export function normalizeHexColor(
  value: string | null | undefined
): string | undefined {
  const input = value?.trim().toLowerCase() ?? "";
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])[a-f\d]?$/.exec(input);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }
  const long = /^#?([a-f\d]{6})(?:[a-f\d]{2})?$/.exec(input);
  return long ? `#${long[1]}` : undefined;
}

/**
 * Creates a draft for a new definition or from an existing one.
 *
 * @param definition the definition to edit, or undefined to create one.
 * @param type the type of a new definition.
 * @returns the draft.
 */
export function createDraft(
  definition: EditablePropertyDefinition | undefined,
  type: PropertyType = "text"
): PropertyDefinitionDraft {
  if (!definition) {
    return { name: "", type, options: [], savedOptionIds: [] };
  }
  return {
    name: definition.name,
    type: definition.type,
    options: definition.options.map((option) => ({ ...option })),
    savedOptionIds: definition.options.map((option) => option.id),
  };
}

/**
 * Whether an option has been saved on the server, in which case documents
 * may use it and it can only be retired.
 *
 * @param draft the draft.
 * @param id the option id.
 * @returns true when the option was saved.
 */
export function isSavedOption(
  draft: PropertyDefinitionDraft,
  id: string
): boolean {
  return draft.savedOptionIds.includes(id);
}

/**
 * Applies an edit to a draft. Saved options cannot be removed, only retired,
 * and the type cannot change once options are saved.
 *
 * @param draft the current draft.
 * @param event the edit to apply.
 * @returns the next draft.
 */
export function propertyDefinitionDraftReducer(
  draft: PropertyDefinitionDraft,
  event: PropertyDefinitionDraftEvent
): PropertyDefinitionDraft {
  const updateOption = (
    id: string,
    update: (option: PropertyOption) => PropertyOption
  ): PropertyDefinitionDraft => ({
    ...draft,
    options: draft.options.map((option) =>
      option.id === id ? update(option) : option
    ),
  });

  switch (event.type) {
    case "nameChanged":
      return { ...draft, name: event.name };
    case "typeChanged":
      if (draft.savedOptionIds.length > 0) {
        return draft;
      }
      return {
        ...draft,
        type: event.propertyType,
        options: hasOptions(event.propertyType)
          ? draft.options.map((option) =>
              withoutShimmer(
                supportsOptionIcons(event.propertyType)
                  ? option
                  : withoutIcon(option),
                event.propertyType
              )
            )
          : [],
      };
    case "optionAdded":
      return { ...draft, options: [...draft.options, event.option] };
    case "optionLabelChanged":
      return updateOption(event.id, (option) => ({
        ...option,
        label: event.label,
      }));
    case "optionColorChanged":
      return updateOption(event.id, (option) => {
        const { color: _color, ...rest } = option;
        const color = normalizeHexColor(event.color);
        return color ? { ...rest, color } : rest;
      });
    case "optionIconChanged":
      return updateOption(event.id, (option) =>
        event.icon ? { ...option, icon: event.icon } : withoutIcon(option)
      );
    case "optionShimmerChanged":
      return updateOption(event.id, (option) => {
        const { shimmer: _shimmer, ...rest } = option;
        return event.shimmer ? { ...rest, shimmer: true } : rest;
      });
    case "optionRetired":
      return updateOption(event.id, (option) => ({
        ...option,
        retired: true,
      }));
    case "optionRestored":
      return updateOption(event.id, (option) => {
        const { retired: _retired, ...rest } = option;
        return rest;
      });
    case "optionRemoved":
      if (isSavedOption(draft, event.id)) {
        return draft;
      }
      return {
        ...draft,
        options: draft.options.filter((option) => option.id !== event.id),
      };
    case "optionMoved": {
      const from = draft.options.findIndex((option) => option.id === event.id);
      const to = from + event.offset;
      if (from === -1 || to < 0 || to >= draft.options.length) {
        return draft;
      }
      const options = [...draft.options];
      const [moved] = options.splice(from, 1);
      options.splice(to, 0, moved);
      return { ...draft, options };
    }
    case "reset":
      return event.draft;
    default:
      return draft;
  }
}

/**
 * Validates a draft before it is sent, mirroring the server limits. Names are
 * compared without case or surrounding spaces; a name used by another
 * definition is only a warning because the server allows it.
 *
 * @param draft the draft to validate.
 * @param otherNames names of the other definitions in the workspace.
 * @returns the errors found.
 */
export function validateDraft(
  draft: PropertyDefinitionDraft,
  otherNames: string[]
): PropertyDefinitionErrors {
  const errors: PropertyDefinitionErrors = { optionLabels: {} };
  const name = normalize(draft.name);

  if (!name) {
    errors.name = "required";
  } else if (name.length > propertyDefinitionLimits.name) {
    errors.name = "tooLong";
  }
  if (name && otherNames.some((other) => normalize(other) === name)) {
    errors.nameWarning = "duplicate";
  }

  if (!hasOptions(draft.type)) {
    return errors;
  }

  if (draft.options.length > propertyDefinitionLimits.options) {
    errors.options = "tooMany";
  }

  const seen = new Set<string>();
  for (const option of draft.options) {
    const label = normalize(option.label);
    if (!label) {
      errors.optionLabels[option.id] = "required";
    } else if (label.length > propertyDefinitionLimits.optionLabel) {
      errors.optionLabels[option.id] = "tooLong";
    } else if (seen.has(label)) {
      errors.optionLabels[option.id] = "duplicate";
    }
    seen.add(label);
  }

  return errors;
}

/**
 * Whether a validation result has any error.
 *
 * @param errors the validation result.
 * @returns true when the draft cannot be saved.
 */
export function hasErrors(errors: PropertyDefinitionErrors): boolean {
  return (
    !!errors.name ||
    !!errors.options ||
    Object.keys(errors.optionLabels).length > 0
  );
}

/**
 * Builds the create request from a draft.
 *
 * @param draft a valid draft.
 * @returns the request body.
 */
export function toCreateInput(
  draft: PropertyDefinitionDraft
): CreatePropertyDefinitionInput {
  const input: CreatePropertyDefinitionInput = {
    name: draft.name.trim(),
    type: draft.type,
  };
  if (hasOptions(draft.type)) {
    input.options = cleanOptions(draft);
  }
  return input;
}

/**
 * Builds the update request from a draft, sending only changed fields. The
 * type is never sent because it cannot change after creation.
 *
 * @param draft a valid draft.
 * @param original the saved definition.
 * @returns the request body.
 */
export function toUpdateInput(
  draft: PropertyDefinitionDraft,
  original: EditablePropertyDefinition
): UpdatePropertyDefinitionInput {
  const input: UpdatePropertyDefinitionInput = { id: original.id };
  const name = draft.name.trim();
  if (name !== original.name) {
    input.name = name;
  }
  if (hasOptions(original.type)) {
    const options = cleanOptions({ ...draft, type: original.type });
    if (!sameOptions(options, original.options)) {
      input.options = options;
    }
  }
  return input;
}

/**
 * Whether a draft differs from what is saved.
 *
 * @param draft the draft.
 * @param original the saved definition, or undefined for a new one.
 * @returns true when there is something to save.
 */
export function isDraftDirty(
  draft: PropertyDefinitionDraft,
  original: EditablePropertyDefinition | undefined
): boolean {
  if (!original) {
    return draft.name.trim() !== "" || draft.options.length > 0;
  }
  const input = toUpdateInput(draft, original);
  return input.name !== undefined || input.options !== undefined;
}

/**
 * Maps a server validation message, formatted as "field: message", to the
 * form field it concerns. Unprefixed messages about options, icons or emoji
 * belong to the options; other messages are returned as general errors.
 *
 * @param message the error message from the server.
 * @returns the field and the message to show beside it.
 */
export function parseServerFieldError(message: string): ServerFieldError {
  const match = /^([A-Za-z]+): (.+)$/s.exec(message.trim());
  if (!match) {
    return {
      field: /option|icon|emoji/i.test(message) ? "options" : null,
      message,
    };
  }
  const [, field, detail] = match;
  if (field === "name") {
    return { field: "name", message: detail };
  }
  if (optionFields.has(field)) {
    return { field: "options", message: detail };
  }
  return { field: null, message };
}

const optionFields = new Set([
  "options",
  "label",
  "color",
  "icon",
  "kind",
  "value",
  "shimmer",
  "retired",
]);

const normalize = (value: string) => value.trim().toLocaleLowerCase();

const withoutIcon = (option: PropertyOption): PropertyOption => {
  const { icon: _icon, ...rest } = option;
  return rest;
};

/** Drops the shimmer from options of types that cannot shimmer. */
const withoutShimmer = (
  option: PropertyOption,
  type: PropertyType
): PropertyOption => {
  if (supportsOptionShimmer(type)) {
    return option;
  }
  const { shimmer: _shimmer, ...rest } = option;
  return rest;
};

const cleanOptions = (draft: PropertyDefinitionDraft): PropertyOption[] =>
  draft.options.map((option) => {
    const clean: PropertyOption = { id: option.id, label: option.label.trim() };
    if (option.color) {
      clean.color = option.color;
    }
    if (option.shimmer && supportsOptionShimmer(draft.type)) {
      clean.shimmer = true;
    }
    if (option.icon && supportsOptionIcons(draft.type)) {
      clean.icon = option.icon;
    }
    if (option.retired) {
      clean.retired = true;
    }
    return clean;
  });

const sameOptions = (a: PropertyOption[], b: PropertyOption[]) =>
  a.length === b.length &&
  a.every((option, index) => {
    const other = b[index];
    return (
      option.id === other.id &&
      option.label === other.label &&
      (option.color ?? "") === (other.color ?? "") &&
      (option.icon?.kind ?? "") === (other.icon?.kind ?? "") &&
      (option.icon?.value ?? "") === (other.icon?.value ?? "") &&
      !!option.shimmer === !!other.shimmer &&
      !!option.retired === !!other.retired
    );
  });
