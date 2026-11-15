import type { InferAttributes, InferCreationAttributes } from "sequelize";
import { Column, DataType, Table } from "sequelize-typescript";
import type { PropertyData } from "@shared/types/documentProperties";
import IdModel from "./base/IdModel";

/** Versioned document property; a null value records a clear. */
@Table({
  tableName: "documentPropertyValues",
  modelName: "documentPropertyValue",
})
export class DocumentPropertyValue extends IdModel<
  InferAttributes<DocumentPropertyValue>,
  Partial<InferCreationAttributes<DocumentPropertyValue>>
> {
  @Column(DataType.UUID)
  teamId: string;

  @Column(DataType.UUID)
  documentId: string;

  @Column(DataType.UUID)
  definitionId: string;

  @Column(DataType.JSONB)
  value: PropertyData | null;

  @Column(DataType.INTEGER)
  version: number;
}
