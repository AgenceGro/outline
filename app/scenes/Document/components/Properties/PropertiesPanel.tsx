import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { observer } from "mobx-react";
import { darken } from "polished";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import type Document from "~/models/Document";
import { ArcScope } from "~/components/Properties/ArcScope";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { AuthorizationError, NotFoundError } from "~/utils/errors";
import { AddPropertyPopover } from "./AddPropertyPopover";
import { TextButton } from "./buttons";
import { CollapsibleRows } from "./CollapsibleRows";
import { panelFrame, ReservedPanel } from "./frame";
import { PropertyRow } from "./PropertyRow";

interface Props {
  /** The document whose properties are shown. */
  document: Document;
  /** Whether the document is shown read-only, as the editor is. */
  readOnly?: boolean;
}

/**
 * The typed properties of a document, shown between its metadata and its
 * content. Editors can change open properties and add more; viewers, and
 * everyone for managed properties, see the values read-only. The section
 * keeps the same collapsed height whatever it holds, and opens to show
 * every row.
 *
 * @param props the component props.
 * @returns the panel, or its reserved space until it can show.
 */
export const PropertiesPanel = observer(function PropertiesPanel({
  document,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const { documentProperties } = useStores();
  const team = useCurrentTeam({ rejectOnEmpty: false });
  const can = usePolicy(document);
  const teamCan = usePolicy(team);
  const headingId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAdd = useRef(false);
  const [pending, setPending] = useState<string[]>([]);
  const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [announcement, setAnnouncement] = useState("");
  const [expandSignal, setExpandSignal] = useState(0);
  const documentId = document.id;

  useEffect(() => {
    const release = documentProperties.retain(documentId);
    void documentProperties.fetch(documentId).catch(() => undefined);
    return release;
  }, [documentProperties, documentId]);

  useEffect(() => {
    if (focusAdd.current) {
      focusAdd.current = false;
      addRef.current?.focus();
    }
  }, [pending, editingIds]);

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const handleAdd = useCallback((definitionId: string) => {
    setPending((ids) =>
      ids.includes(definitionId) ? ids : [...ids, definitionId]
    );
    setExpandSignal((count) => count + 1);
  }, []);

  const handleSettled = useCallback((definitionId: string, saved: boolean) => {
    focusAdd.current = !saved;
    setPending((ids) => ids.filter((id) => id !== definitionId));
  }, []);

  const handleEditingChange = useCallback(
    (definitionId: string, editing: boolean) => {
      if (!editing && !documentProperties.valueFor(documentId, definitionId)) {
        focusAdd.current = true;
      }
      setEditingIds((ids) => {
        if (ids.has(definitionId) === editing) {
          return ids;
        }
        const next = new Set(ids);
        if (editing) {
          next.add(definitionId);
        } else {
          next.delete(definitionId);
        }
        return next;
      });
    },
    [documentProperties, documentId]
  );

  const handleRetry = () => {
    void documentProperties
      .fetch(documentId, { force: true })
      .catch(() => undefined);
  };

  const canEdit =
    Boolean(can.update) &&
    !readOnly &&
    !document.isArchived &&
    !document.isDeleted;
  const canCreate = canEdit && Boolean(teamCan.update);
  const error = documentProperties.fetchError(documentId);
  const loaded = documentProperties.isLoaded(documentId);

  if (!loaded) {
    if (
      !error ||
      error instanceof AuthorizationError ||
      error instanceof NotFoundError
    ) {
      return <ReservedPanel />;
    }
    return (
      <Panel aria-labelledby={headingId}>
        <VisuallyHidden.Root asChild>
          <h2 id={headingId}>{t("Properties")}</h2>
        </VisuallyHidden.Root>
        <LoadError role="alert">
          <span>{t("Properties could not be loaded.")}</span>
          <TextButton type="button" onClick={handleRetry}>
            {t("Try again")}
          </TextButton>
        </LoadError>
      </Panel>
    );
  }

  // Rows being added, edited, or showing a conflict stay mounted when their
  // value is cleared elsewhere, so the user's draft and the notice are kept.
  const rows = documentProperties
    .definitionsFor(documentId)
    .filter(
      (definition) =>
        documentProperties.valueFor(documentId, definition.id) ||
        pending.includes(definition.id) ||
        editingIds.has(definition.id) ||
        documentProperties.hasConflict(documentId, definition.id)
    );
  const canAdd =
    canEdit &&
    (canCreate || documentProperties.availableFor(documentId).length > 0);

  return (
    <ArcScope>
      <Panel aria-labelledby={headingId}>
        <VisuallyHidden.Root asChild>
          <h2 id={headingId}>{t("Properties")}</h2>
        </VisuallyHidden.Root>
        <CollapsibleRows
          expandSignal={expandSignal}
          footer={
            canAdd ? (
              <AddPropertyPopover
                documentId={documentId}
                canCreate={canCreate}
                onAdd={handleAdd}
                onAnnounce={announce}
                triggerRef={addRef}
              />
            ) : undefined
          }
        >
          {rows.length > 0 ? (
            <List role="list">
              {rows.map((definition) => (
                <PropertyRow
                  key={definition.id}
                  documentId={documentId}
                  definition={definition}
                  value={documentProperties.valueFor(documentId, definition.id)}
                  canEdit={canEdit}
                  isNew={pending.includes(definition.id)}
                  onSettled={handleSettled}
                  onEditingChange={handleEditingChange}
                  onAnnounce={announce}
                />
              ))}
            </List>
          ) : (
            <Empty>{t("This document has no properties yet.")}</Empty>
          )}
        </CollapsibleRows>
        <VisuallyHidden.Root role="status" aria-live="polite">
          {announcement}
        </VisuallyHidden.Root>
      </Panel>
    </ArcScope>
  );
});

const Panel = styled.section`
  ${panelFrame}
  display: flex;
  flex-direction: column;
  gap: var(--properties-gap);
  min-height: var(--properties-height);
`;

const List = styled.ul`
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Empty = styled.p`
  display: flex;
  align-items: center;
  min-height: 32px;
  margin: 0;
  padding: 4px 0;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const LoadError = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: ${(props) =>
    props.theme.isDark ? props.theme.danger : darken(0.1, props.theme.danger)};
  font-size: 14px;

  ${TextButton} {
    color: ${s("text")};
  }
`;
