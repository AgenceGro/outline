import type {
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";
import { newPropertyOption } from "~/components/Properties/options";

/** Why the create property form could not be submitted. */
export type DefinitionFormError =
  | "name"
  | "nameTooLong"
  | "options"
  | "optionTooLong"
  | "tooManyOptions";

/** The input for creating a definition, or the reason it is invalid. */
export type DefinitionFormResult =
  | {
      ok: true;
      value: { name: string; type: PropertyType; options?: PropertyOption[] };
    }
  | { ok: false; error: DefinitionFormError };

/** The limits the server applies to new definitions. */
export const definitionLimits = {
  name: 150,
  optionLabel: 100,
  options: 200,
};

/**
 * Turns the create property form into the input for
 * `propertyDefinitions.createDefinition`. Select options are entered one per
 * line; blank and repeated lines are ignored.
 *
 * @param form the values of the form.
 * @param form.name the name of the property.
 * @param form.type the type of the property.
 * @param form.options the options, one per line, for select types.
 * @returns the definition input, or the reason it is invalid.
 */
export function definitionInputFromForm(form: {
  name: string;
  type: PropertyType;
  options: string;
}): DefinitionFormResult {
  const name = form.name.trim();
  if (!name) {
    return { ok: false, error: "name" };
  }
  if (name.length > definitionLimits.name) {
    return { ok: false, error: "nameTooLong" };
  }
  if (form.type !== "singleSelect" && form.type !== "multiSelect") {
    return { ok: true, value: { name, type: form.type } };
  }

  const seen = new Set<string>();
  const labels = form.options
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const key = line.toLocaleLowerCase();
      if (!line || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  if (!labels.length) {
    return { ok: false, error: "options" };
  }
  if (labels.some((label) => label.length > definitionLimits.optionLabel)) {
    return { ok: false, error: "optionTooLong" };
  }
  if (labels.length > definitionLimits.options) {
    return { ok: false, error: "tooManyOptions" };
  }
  return {
    ok: true,
    value: {
      name,
      type: form.type,
      options: labels.map((label) => newPropertyOption(label)),
    },
  };
}
