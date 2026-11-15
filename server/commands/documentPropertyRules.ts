import { z } from "zod";
import type {
  PropertyAccess,
  PropertyData,
  PropertyOwner,
  PropertyType,
  PropertyOption,
} from "@shared/types/documentProperties";
import { ValidationError } from "@server/errors";

interface PropertySchema {
  owner: PropertyOwner;
  type: PropertyType;
  access: PropertyAccess;
  options: PropertyOption[];
}

/**
 * Checks whether a writer with document edit access may change this value.
 *
 * @param owner the trusted identity of the writer.
 * @param definition the definition governing this value.
 * @returns whether this writer may set or clear the value.
 */
export function mayWriteProperty(
  owner: PropertyOwner,
  definition: Pick<PropertySchema, "access" | "owner">
) {
  return (
    definition.access === "open" ||
    (owner !== "workspace" && definition.owner === owner)
  );
}

/**
 * Validates a value before it is stored; retired choices may only be retained.
 *
 * @param definition the property's schema.
 * @param value the proposed value.
 * @param previous the currently assigned value.
 * @throws ValidationError for an incompatible value.
 */
export function validatePropertyValue(
  definition: PropertySchema,
  value: PropertyData,
  previous: PropertyData | null
) {
  const prior = Array.isArray(previous) ? previous : [previous];
  const available = (id: string) =>
    definition.options.some(
      (option) => option.id === id && (!option.retired || prior.includes(id))
    );
  const valid = (() => {
    switch (definition.type) {
      case "text":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "checkbox":
        return typeof value === "boolean";
      case "date":
        return z.iso.date().safeParse(value).success;
      case "url":
        return z.url({ protocol: /^https?$/ }).safeParse(value).success;
      case "textList":
        return Array.isArray(value);
      case "singleSelect":
        return typeof value === "string" && available(value);
      case "multiSelect":
        return (
          Array.isArray(value) &&
          new Set(value).size === value.length &&
          value.every(available)
        );
    }
  })();
  if (!valid) {
    throw ValidationError("The value does not match the property definition.");
  }
}
