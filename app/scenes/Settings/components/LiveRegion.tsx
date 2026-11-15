import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import * as React from "react";

interface Props {
  /** The latest message to announce. */
  message: string;
}

/**
 * A visually hidden polite live region that announces status changes, such
 * as a completed save, without moving focus.
 *
 * @param props the region props.
 * @returns the live region element.
 */
export function LiveRegion({ message }: Props) {
  return (
    <VisuallyHidden.Root role="status" aria-live="polite" aria-atomic="true">
      {message}
    </VisuallyHidden.Root>
  );
}

/**
 * Holds the message for a LiveRegion. Announcing the same text twice clears
 * the region first so screen readers repeat it.
 *
 * @returns the current message and a function to announce a new one.
 */
export function useLiveAnnouncer(): {
  message: string;
  announce: (text: string) => void;
} {
  const [message, setMessage] = React.useState("");
  const timeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const announce = React.useCallback((text: string) => {
    setMessage("");
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setMessage(text), 100);
  }, []);

  React.useEffect(() => () => clearTimeout(timeout.current), []);

  return { message, announce };
}
