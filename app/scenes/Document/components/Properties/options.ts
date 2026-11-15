import type { PropertyDefinition } from "~/models/PropertyDefinition";

/** An option offered by a select property's picker. */
export interface ChoosableOption {
  /** The ID of the option. */
  value: string;
  /** The label of the option. */
  label: string;
}

/**
 * The options a select property offers. Retired options are offered only
 * while they are assigned, so they can be kept or removed.
 *
 * @param definition the definition of the property.
 * @param assigned the IDs of the options currently assigned.
 * @returns the options to offer, in the definition's order.
 */
export function choosableOptions(
  definition: PropertyDefinition,
  assigned: readonly string[]
): ChoosableOption[] {
  return definition.options
    .filter((option) => !option.retired || assigned.includes(option.id))
    .map((option) => ({ value: option.id, label: option.label }));
}

/**
 * Whether two selections hold the same options, in any order.
 *
 * @param a the first selection.
 * @param b the second selection.
 * @returns true if they hold the same options.
 */
export function sameSelection(
  a: readonly string[],
  b: readonly string[]
): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
