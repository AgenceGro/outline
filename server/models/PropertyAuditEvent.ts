import type { InferAttributes, InferCreationAttributes } from "sequelize";
import { Column, DataType, Table } from "sequelize-typescript";
import IdModel from "./base/IdModel";

/** Property mutation attribution, retained without recording field values. */
@Table({ tableName: "propertyAuditEvents", modelName: "propertyAuditEvent" })
export class PropertyAuditEvent extends IdModel<
  InferAttributes<PropertyAuditEvent>,
  Partial<InferCreationAttributes<PropertyAuditEvent>>
> {
  @Column(DataType.UUID)
  teamId: string;

  @Column(DataType.STRING)
  actorType: "user" | "installation" | "outline";

  @Column(DataType.UUID)
  actorId: string | null;

  @Column(DataType.STRING)
  action: string;

  @Column(DataType.UUID)
  documentId: string | null;

  @Column(DataType.UUID)
  definitionId: string | null;
}
