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
import type { PropertyType } from "@shared/types/documentProperties";
import type { PropertyTypeIconProps } from "./labels";

interface Props extends PropertyTypeIconProps {
  /** The property type to represent. */
  type: PropertyType;
}

/**
 * The icon that represents a property type, decorative and hidden from
 * assistive technology. Matches {@link propertyTypeIcon}.
 *
 * @param props the component props.
 * @returns the icon.
 */
export function PropertyTypeIcon({
  type,
  size,
  color = "currentColor",
}: Props) {
  const props = { size, color, "aria-hidden": true };
  switch (type) {
    case "number":
      return <HashtagIcon {...props} />;
    case "checkbox":
      return <CheckboxIcon {...props} checked />;
    case "date":
      return <CalendarIcon {...props} />;
    case "url":
      return <LinkIcon {...props} />;
    case "singleSelect":
      return <CheckmarkIcon {...props} />;
    case "multiSelect":
      return <TodoListIcon {...props} />;
    case "textList":
      return <BulletedListIcon {...props} />;
    default:
      return <EditIcon {...props} />;
  }
}
