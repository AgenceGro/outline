/** Supported document metadata types, independent of the document body. */
export const propertyTypes = [
  "text",
  "number",
  "checkbox",
  "date",
  "url",
  "singleSelect",
  "multiSelect",
  "textList",
] as const;

export type PropertyType = (typeof propertyTypes)[number];
export type PropertyOwner = "workspace" | "altai" | "outline";
export type PropertyAccess = "open" | "managed";
export type PropertyData = string | number | boolean | string[];

export interface PropertyOption {
  id: string;
  label: string;
  color?: string;
  /** Whether the label of this single-select option shimmers. Defaults to false. */
  shimmer?: boolean;
  icon?: { kind: "builtin" | "emoji"; value: string };
  retired?: boolean;
}
