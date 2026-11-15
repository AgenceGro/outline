import { Suspense } from "react";
import type Document from "~/models/Document";
import { createLazyComponent } from "~/components/LazyLoad";
import { ReservedPanel } from "./frame";

interface Props {
  /** The document whose properties are shown. */
  document: Document;
  /** Whether the document is shown read-only, as the editor is. */
  readOnly?: boolean;
}

const LazyPropertiesPanel = createLazyComponent(
  () => import("./PropertiesPanel"),
  { exportName: "PropertiesPanel" }
);

/**
 * The typed properties of an internal document. The panel loads separately
 * from the editor and holds its collapsed height until it is ready, so it
 * never delays or moves the document content.
 *
 * @param props the component props.
 * @returns the lazily loaded panel.
 */
export function DocumentProperties({ document, readOnly }: Props) {
  return (
    <Suspense fallback={<ReservedPanel />}>
      <LazyPropertiesPanel.Component
        key={document.id}
        document={document}
        readOnly={readOnly}
      />
    </Suspense>
  );
}
