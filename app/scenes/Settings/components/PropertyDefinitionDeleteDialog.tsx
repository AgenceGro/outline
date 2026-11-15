import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Button from "~/components/Button";
import Text from "~/components/Text";
import type { PropertyDefinition } from "~/models/PropertyDefinition";
import useStores from "~/hooks/useStores";
import { InlineAlert } from "./InlineAlert";
import type { PropertyUsageTracker } from "./propertyUsage";
import { requestErrorMessage } from "./requestError";

interface Props {
  /** The definition to delete. */
  definition: PropertyDefinition;
  /** Which usage counts are known. */
  usage: PropertyUsageTracker;
  /** Called after the definition was deleted. */
  onDeleted: (name: string) => void;
  /** Called when the dialog is dismissed. */
  onCancel: () => void;
}

/**
 * Confirms deleting a property definition, stating how many documents lose a
 * value. Deleting stays disabled until a fresh list has supplied that number.
 *
 * @param props the dialog props.
 * @returns the dialog content.
 */
export const PropertyDefinitionDeleteDialog = observer(
  function PropertyDefinitionDeleteDialog({
    definition,
    usage,
    onDeleted,
    onCancel,
  }: Props) {
    const { t } = useTranslation();
    const { propertyDefinitions } = useStores();
    const [deleting, setDeleting] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const [retrying, setRetrying] = React.useState(false);
    const usageId = React.useId();
    const deleteRef = React.useRef<HTMLButtonElement>(null);
    const documents = usage.usageOf(definition, propertyDefinitions.isFetching);
    const canDelete = documents.status === "known";
    const [focusDelete] = React.useState(canDelete);
    const name = definition.name;

    const handleDelete = React.useCallback(async () => {
      if (!canDelete) {
        return;
      }
      setDeleting(true);
      setError(undefined);
      try {
        await propertyDefinitions.deleteDefinition(definition.id);
        onDeleted(name);
      } catch (err) {
        setError(requestErrorMessage(err, t("Something went wrong")));
        setDeleting(false);
      }
    }, [canDelete, definition.id, name, onDeleted, propertyDefinitions, t]);

    const handleSubmit = React.useCallback(
      (ev: React.FormEvent) => {
        ev.preventDefault();
        void handleDelete();
      },
      [handleDelete]
    );

    const handleRetry = React.useCallback(() => {
      void handleDelete();
    }, [handleDelete]);

    const handleRecount = React.useCallback(async () => {
      setRetrying(true);
      try {
        await usage.refresh();
        requestAnimationFrame(() => deleteRef.current?.focus());
      } catch {
        // The tracker records the failure, which the dialog shows.
      } finally {
        setRetrying(false);
      }
    }, [usage]);

    return (
      <Form onSubmit={handleSubmit}>
        <Usage id={usageId} aria-live="polite">
          {documents.status === "counting"
            ? `${t("Counting documents that use this property")}…`
            : documents.status === "failed"
              ? t("Usage couldn’t be loaded. Try again.")
              : documents.count === 0
                ? t("Not used in any documents")
                : t("Used in {{ count }} document", {
                    count: documents.count,
                  })}
        </Usage>
        {(documents.status === "failed" || retrying) && (
          <div>
            <Button
              type="button"
              neutral
              onClick={() => void handleRecount()}
              disabled={documents.status === "counting"}
            >
              {t("Try again")}
            </Button>
          </div>
        )}
        <Text as="p" type="secondary">
          {documents.status !== "known"
            ? t(
                "You can delete {{ name }} once the number of documents that use it is known.",
                { name }
              )
            : documents.count === 0
              ? t(
                  "{{ name }} is removed from the workspace. This can’t be undone.",
                  { name }
                )
              : t(
                  "{{ name }} and its values are removed from {{ count }} document. This can’t be undone.",
                  { name, count: documents.count }
                )}
        </Text>

        {error && (
          <InlineAlert
            title={t("The property wasn’t deleted")}
            retryLabel={t("Try again")}
            onRetry={handleRetry}
            retrying={deleting}
          >
            {error}
          </InlineAlert>
        )}

        <Footer>
          <Button
            type="button"
            neutral
            onClick={onCancel}
            disabled={deleting}
            autoFocus={!focusDelete}
          >
            {t("Cancel")}
          </Button>
          <DeleteButton
            ref={deleteRef}
            type="submit"
            danger
            disabled={deleting || !canDelete}
            aria-describedby={usageId}
            autoFocus={focusDelete}
          >
            {deleting ? `${t("Deleting")}…` : t("Delete property")}
          </DeleteButton>
        </Footer>
      </Form>
    );
  }
);

const Form = styled.form`
  display: grid;
  gap: 12px;
  padding-top: 8px;

  p {
    margin: 0;
  }
`;

const Usage = styled.p`
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
`;

const Footer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
`;

const DeleteButton = styled(Button)`
  &:disabled {
    opacity: 0.5;
  }
`;
