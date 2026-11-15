import { UserPreference } from "@shared/types";
import { UserPreferenceDefaults } from "@shared/constants";
import useCurrentUser from "~/hooks/useCurrentUser";
import type { PropertyDateStyle } from "./dates";

/**
 * The locale and date style the current user reads property dates in. Without
 * a signed-in user, dates use the default style.
 *
 * @returns the locale, as a BCP 47 tag, and the date style.
 */
export function usePropertyDateFormat(): {
  locale?: string;
  dateStyle: PropertyDateStyle;
} {
  const user = useCurrentUser({ rejectOnEmpty: false });
  return {
    locale: user?.language?.replace("_", "-"),
    dateStyle:
      user?.getPreference(UserPreference.PropertyDateStyle) ??
      UserPreferenceDefaults[UserPreference.PropertyDateStyle] ??
      "long",
  };
}
