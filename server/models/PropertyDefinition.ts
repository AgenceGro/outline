import type { InferAttributes, InferCreationAttributes } from "sequelize";
import { Column, DataType, Table } from "sequelize-typescript";
import type {
  PropertyOwner,
  PropertyType,
  PropertyAccess,
  PropertyOption,
} from "@shared/types/documentProperties";
import IdModel from "./base/IdModel";

/** Workspace schema for a document property. */
@Table({ tableName: "propertyDefinitions", modelName: "propertyDefinition" })
export class PropertyDefinition extends IdModel<
  InferAttributes<PropertyDefinition>,
  Partial<InferCreationAttributes<PropertyDefinition>>
> {
  @Column(DataType.UUID)
  teamId: string;

  @Column(DataType.STRING)
  owner: PropertyOwner;

  @Column(DataType.UUID)
  installationId: string | null;

  @Column(DataType.TEXT)
  key: string | null;

  @Column(DataType.TEXT)
  name: string;

  @Column(DataType.STRING)
  type: PropertyType;

  @Column(DataType.STRING)
  access: PropertyAccess;

  @Column(DataType.JSONB)
  options: PropertyOption[];
}
