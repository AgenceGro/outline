import type { PropertyData } from "@shared/types/documentProperties";

/**
 * The value of a property on a document. A null value is a tombstone left by
 * clearing the property: it keeps the version, but is never rendered.
 */
export interface DocumentPropertyValue {
  documentId: string;
  definitionId: string;
  value: PropertyData | null;
  version: number;
}

/** A value that is set, as rendered on a document. */
export interface AssignedPropertyValue extends DocumentPropertyValue {
  value: PropertyData;
}

/**
 * Whether a value is set rather than a tombstone.
 *
 * @param value the value to check.
 * @returns true if the value is set.
 */
export function isAssignedPropertyValue(
  value: DocumentPropertyValue
): value is AssignedPropertyValue {
  return value.value !== null && value.value !== undefined;
}
