import { observer } from "mobx-react";
import { useEffect, useRef } from "react";
import styled from "styled-components";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import { InlineEdit } from "~/components/arc/inline-edit/inline-edit";

/** What saved the text: leaving the field, or Enter and the save button. */
export type TextSaveTrigger = "blur" | "commit";

interface Props {
  /** The definition of the text property. */
  definition: PropertyDefinition;
  /** The saved text, or an empty string. */
  value: string;
  /** Shown when there is no text. */
  placeholder: string;
  /** Changing it discards the editor's state and shows `value` afresh. */
  resetKey: number;
  /** Whether to start editing when mounted, for a new property. */
  autoEdit?: boolean;
  /** Whether to focus the text after a reset. */
  focusOnReset?: boolean;
  /** Returns a message when the text cannot be saved. */
  validate: (next: string) => string | null;
  /** Called when editing starts or stops. */
  onEditingChange: (editing: boolean) => void;
  /** Saves the text; rejects to restore the saved text. */
  onSave: (next: string, trigger: TextSaveTrigger) => Promise<void>;
}

/**
 * The value of an editable text property. The text itself is the editor:
 * pressing it edits in place, Enter saves, and Escape cancels.
 *
 * @param props the component props.
 * @returns the editable text.
 */
export const TextValue = observer(function TextValue({
  definition,
  value,
  placeholder,
  resetKey,
  autoEdit = false,
  focusOnReset = false,
  validate,
  onEditingChange,
  onSave,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editingChange = useRef(onEditingChange);
  editingChange.current = onEditingChange;
  const firstReset = useRef(resetKey);
  const autoEdited = useRef(false);
  const leaving = useRef(false);

  // The editor marks itself while editing.
  useEffect(() => {
    const editor = rootRef.current?.firstElementChild;
    if (!editor) {
      return;
    }
    let editing = editor.hasAttribute("data-editing");
    const observer = new MutationObserver(() => {
      const next = editor.hasAttribute("data-editing");
      if (next !== editing) {
        editing = next;
        editingChange.current(next);
      }
    });
    observer.observe(editor, {
      attributes: true,
      attributeFilter: ["data-editing"],
    });
    return () => {
      observer.disconnect();
      if (editing) {
        editingChange.current(false);
      }
    };
  }, [resetKey]);

  useEffect(() => {
    if (autoEdit && !autoEdited.current) {
      autoEdited.current = true;
      rootRef.current?.querySelector("button")?.click();
    }
  }, [autoEdit]);

  useEffect(() => {
    if (resetKey !== firstReset.current && focusOnReset) {
      rootRef.current?.querySelector("button")?.focus();
    }
  }, [resetKey, focusOnReset]);

  // The editor saves when focus leaves it, a moment after this event, so a
  // save in that moment was made by leaving rather than by choice.
  const handleBlur = (ev: React.FocusEvent) => {
    const next = ev.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) {
      return;
    }
    leaving.current = true;
    setTimeout(() => {
      leaving.current = false;
    });
  };

  return (
    <Wrapper ref={rootRef} onBlur={handleBlur}>
      <Editor
        key={resetKey}
        value={value}
        label={definition.name}
        placeholder={placeholder}
        validate={validate}
        onSave={(next) => onSave(next, leaving.current ? "blur" : "commit")}
        variant="body"
        multiline
      />
    </Wrapper>
  );
});

const Wrapper = styled.div`
  display: grid;
  min-width: 0;
`;

/** Matches the size and color of the other values in the panel. */
const Editor = styled(InlineEdit)`
  &&& {
    --size: var(--text-base);
    --ink: var(--foreground);
  }
`;
