import type { InferAttributes, InferCreationAttributes } from "sequelize";
import { Column, DataType, Table } from "sequelize-typescript";
import IdModel from "./base/IdModel";

/** Workspace installation whose credential grants access to the property API. */
@Table({
  tableName: "propertyInstallations",
  modelName: "propertyInstallation",
})
export class PropertyInstallation extends IdModel<
  InferAttributes<PropertyInstallation>,
  Partial<InferCreationAttributes<PropertyInstallation>>
> {
  @Column(DataType.UUID)
  teamId: string;

  @Column(DataType.STRING)
  provider: "altai";

  @Column(DataType.TEXT)
  tokenHash: string | null;
}
