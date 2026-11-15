import type { TFunction } from "i18next";
import {
  BulletedListIcon,
  CalendarIcon,
  CheckboxIcon,
  CheckmarkIcon,
  EditIcon,
  HashtagIcon,
  LinkIcon,
  TodoListIcon,
} from "outline-icons";
import type {
  PropertyOwner,
  PropertyType,
} from "@shared/types/documentProperties";

/** Props accepted by the icon of a property type. */
export interface PropertyTypeIconProps {
  size?: number;
  color?: string;
}

/**
 * The display name of a property type, in sentence case.
 *
 * @param type the property type.
 * @param t the translation function.
 * @returns the translated label.
 */
export function propertyTypeLabel(type: PropertyType, t: TFunction): string {
  switch (type) {
    case "text":
      return t("Text");
    case "number":
      return t("Number");
    case "checkbox":
      return t("Checkbox");
    case "date":
      return t("Date");
    case "url":
      return t("URL");
    case "singleSelect":
      return t("Single select");
    case "multiSelect":
      return t("Multi-select");
    case "textList":
      return t("Text list");
    default:
      return type;
  }
}

/**
 * The icon that represents a property type.
 *
 * @param type the property type.
 * @returns the icon component.
 */
export function propertyTypeIcon(
  type: PropertyType
): React.ComponentType<PropertyTypeIconProps> {
  switch (type) {
    case "number":
      return HashtagIcon;
    case "checkbox":
      return CheckboxIcon;
    case "date":
      return CalendarIcon;
    case "url":
      return LinkIcon;
    case "singleSelect":
      return CheckmarkIcon;
    case "multiSelect":
      return TodoListIcon;
    case "textList":
      return BulletedListIcon;
    default:
      return EditIcon;
  }
}

/**
 * The name of the owner of a definition, used to explain who manages it.
 *
 * @param owner the owner of the definition.
 * @param t the translation function.
 * @returns the translated owner name.
 */
export function propertyOwnerLabel(owner: PropertyOwner, t: TFunction): string {
  switch (owner) {
    case "altai":
      return "Altai";
    case "outline":
      return "Outline";
    default:
      return t("Workspace");
  }
}

/**
 * An accessible explanation of why a managed property is locked.
 *
 * @param owner the owner of the definition.
 * @param t the translation function.
 * @returns the translated explanation.
 */
export function managedPropertyDescription(
  owner: PropertyOwner,
  t: TFunction
): string {
  switch (owner) {
    case "altai":
      return t("Managed by Altai. Change it in Altai.");
    case "outline":
      return t("Managed by Outline. It cannot be edited here.");
    default:
      return t("Managed by an integration. It cannot be edited here.");
  }
}
