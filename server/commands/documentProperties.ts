import { Op } from "sequelize";
import type { SaveOptions, Transaction } from "sequelize";
import type {
  PropertyData,
  PropertyOwner,
  PropertyOption,
  PropertyType,
} from "@shared/types/documentProperties";
import {
  AuthorizationError,
  DocumentConflictError,
  NotFoundError,
  ValidationError,
} from "@server/errors";
import Metrics from "@server/logging/Metrics";
import Logger from "@server/logging/Logger";
import {
  Collection,
  Document,
  DocumentPropertyValue,
  Emoji,
  PropertyAuditEvent,
  PropertyDefinition,
  type User,
} from "@server/models";
import { authorize, can } from "@server/policies";
import { websocketQueue } from "@server/queues";
import { afterCommit } from "@server/storage/transaction";
import {
  mayWriteProperty,
  validatePropertyValue,
} from "./documentPropertyRules";
import type { PropertyRequest } from "@server/routes/api/documentProperties/schema";

export type PropertyActor =
  | { kind: "user"; user: User; teamId: string }
  | {
      kind: "installation";
      provider: "altai";
      id: string;
      teamId: string;
      agentId?: string;
    }
  | { kind: "outline"; teamId: string };

/** Commands shared by authorized RPC callers and trusted internal Outline providers. */
export class DocumentProperties {
  constructor(
    private readonly actor: PropertyActor,
    private readonly transaction: Transaction
  ) {}

  /**
   * Lists the workspace schema for administrators and providers.
   *
   * @returns definitions and the number of documents using each one.
   */
  public async definitions() {
    if (this.actor.kind === "user") {
      authorize(this.actor.user, "update", this.actor.user.team);
    }
    const where = { teamId: this.actor.teamId };
    const [definitions, counts] = await Promise.all([
      PropertyDefinition.findAll({
        where,
        order: [["name", "ASC"]],
        transaction: this.transaction,
      }),
      DocumentPropertyValue.count({
        where: { ...where, value: { [Op.ne]: null } },
        group: ["definitionId"],
        transaction: this.transaction,
      }),
    ]);
    const usage = new Map(
      counts.map((row) => [row.definitionId, Number(row.count)])
    );
    return definitions.map((d) => ({
      ...this.present(d),
      affectedDocumentCount: usage.get(d.id) ?? 0,
    }));
  }

  /**
   * Provisions a property in the authenticated provider's namespace.
   *
   * @param input the schema and optional stable provider key.
   * @returns the newly created or previously provisioned definition.
   */
  public async create(input: PropertyRequest<"create">["body"]) {
    this.authorizeDefinition();
    if (
      this.owner === "workspace"
        ? input.key || input.access === "managed"
        : !input.key
    ) {
      throw ValidationError(
        "Provider definitions require a stable key. Workspace definitions must be open."
      );
    }
    const defaults = {
      teamId: this.actor.teamId,
      name: input.name,
      type: input.type,
      owner: this.owner,
      installationId: this.actor.kind === "installation" ? this.actor.id : null,
      key: input.key ?? null,
      access: input.access ?? (this.owner === "workspace" ? "open" : "managed"),
      options: input.options ?? [],
    };
    await this.validateOptions(defaults.type, defaults.options);
    const [definition, created] = input.key
      ? await PropertyDefinition.findOrCreate({
          where: {
            teamId: this.actor.teamId,
            owner: this.owner,
            key: input.key,
          },
          defaults,
          transaction: this.transaction,
        })
      : [
          await PropertyDefinition.create(defaults, {
            transaction: this.transaction,
          }),
          true,
        ];
    if (definition.type !== input.type) {
      throw DocumentConflictError(
        "The provider key already belongs to a different property type."
      );
    }
    if (created) {
      await this.record("create", definition.id);
    }
    return this.present(definition);
  }

  /**
   * Updates mutable schema fields, retaining removed option IDs as retired.
   *
   * @param input the definition ID and requested changes.
   * @returns the updated definition.
   */
  public async update(input: PropertyRequest<"update">["body"]) {
    const definition = await this.ownedDefinition(input.id);
    if (input.access === "managed" && definition.owner === "workspace") {
      throw ValidationError("Workspace properties must be open.");
    }
    if (input.options) {
      await this.validateOptions(
        definition.type,
        input.options,
        definition.options
      );
      const ids = new Set(input.options.map((o) => o.id));
      definition.options = [
        ...input.options,
        ...definition.options
          .filter((o) => !ids.has(o.id))
          .map((o) => ({ ...o, retired: true })),
      ];
    }
    if (input.name !== undefined) {
      definition.name = input.name;
    }
    if (input.access !== undefined) {
      definition.access = input.access;
    }
    await definition.save({ transaction: this.transaction });
    await this.record("update", definition.id);
    return this.present(definition);
  }

  /**
   * Deletes a definition and all its dependent values in one transaction.
   *
   * @param id the workspace definition to remove.
   */
  public async remove(id: string) {
    const definition = await this.ownedDefinition(id);
    await definition.destroy({ transaction: this.transaction });
    await this.record("delete", id);
  }

  /**
   * Loads assigned properties and the definitions an editor can add.
   *
   * @param documentId the document to inspect.
   * @returns accessible definitions and their versioned assignments.
   */
  public async list(documentId: string) {
    const document = await this.document(documentId, false);
    const teamId = this.actor.teamId;
    const values = await DocumentPropertyValue.findAll({
      where: { teamId, documentId },
      transaction: this.transaction,
    });
    const editor =
      this.actor.kind !== "user" || can(this.actor.user, "update", document);
    const assigned = values
      .filter((v) => v.value !== null)
      .map((v) => v.definitionId);
    const definitions = await PropertyDefinition.findAll({
      where: {
        teamId,
        [Op.or]: [
          { id: assigned },
          ...(editor
            ? [
                { access: "open" },
                ...(this.owner !== "workspace" ? [{ owner: this.owner }] : []),
              ]
            : []),
        ],
      },
      order: [["name", "ASC"]],
      transaction: this.transaction,
    });
    const visible = new Set(definitions.map((d) => d.id));
    return {
      definitions: definitions.map((d) => this.present(d)),
      values: values
        .filter((v) => visible.has(v.definitionId))
        .map((v) => this.presentValue(v)),
    };
  }

  /**
   * Sets or clears a value under an optimistic version check.
   *
   * @param documentId the document being edited.
   * @param definitionId the schema for the assignment.
   * @param version the last version observed, or zero for a new assignment.
   * @param value the typed value, or null to clear.
   * @returns the assignment with its new version.
   * @throws DocumentConflictError if another writer has changed this field.
   */
  public async write(
    documentId: string,
    definitionId: string,
    version: number,
    value: PropertyData | null
  ) {
    await this.document(documentId, true);
    const definition = await PropertyDefinition.findOne({
      where: { teamId: this.actor.teamId, id: definitionId },
      lock: this.transaction.LOCK.SHARE,
      transaction: this.transaction,
      rejectOnEmpty: true,
    });
    if (
      !mayWriteProperty(this.owner, definition) ||
      (definition.access === "managed" && !this.owns(definition))
    ) {
      throw AuthorizationError();
    }
    const where = { teamId: this.actor.teamId, documentId, definitionId };
    const existing = await DocumentPropertyValue.findOne({
      where,
      transaction: this.transaction,
    });
    if (version !== (existing?.version ?? 0)) {
      Metrics.increment("properties.write_conflict");
      throw DocumentConflictError(
        "This property changed. Reload its value before saving."
      );
    }
    if (value !== null) {
      validatePropertyValue(definition, value, existing?.value ?? null);
    }
    const change = { value, version: version + 1 };

    // Property contents must not be included in Sequelize's optional SQL debug log.
    const writeOptions = {
      transaction: this.transaction,
      logging: false,
    } satisfies SaveOptions;
    const result = existing
      ? await existing.update(change, writeOptions)
      : await DocumentPropertyValue.create(
          { ...where, ...change },
          writeOptions
        );
    await this.record(
      value === null ? "clear" : "set",
      definitionId,
      documentId
    );
    return this.presentValue(result);
  }

  private get owner(): PropertyOwner {
    return this.actor.kind === "installation"
      ? this.actor.provider
      : this.actor.kind === "user"
        ? "workspace"
        : "outline";
  }

  private owns(definition: PropertyDefinition) {
    return (
      definition.owner === this.owner &&
      (this.actor.kind !== "installation" ||
        definition.installationId === this.actor.id)
    );
  }

  private authorizeDefinition() {
    if (this.actor.kind === "user") {
      authorize(this.actor.user, "update", this.actor.user.team);
    }
  }

  private async ownedDefinition(id: string) {
    this.authorizeDefinition();
    const definition = await PropertyDefinition.findOne({
      where: { id, teamId: this.actor.teamId },
      transaction: this.transaction,
      lock: true,
      rejectOnEmpty: true,
    });
    if (!this.owns(definition)) {
      throw AuthorizationError();
    }
    return definition;
  }

  private async validateOptions(
    type: PropertyType,
    options: PropertyOption[],
    previous: PropertyOption[] = []
  ) {
    if (options.length && type !== "singleSelect" && type !== "multiSelect") {
      throw ValidationError("Only select properties accept options.");
    }
    if (type !== "singleSelect" && options.some((o) => o.icon)) {
      throw ValidationError("Only single-select options accept icons.");
    }
    if (
      type !== "singleSelect" &&
      options.some((o) => o.shimmer !== undefined)
    ) {
      throw ValidationError("Only single-select options accept shimmer.");
    }
    const ids = new Set(
      options.flatMap((o) =>
        o.icon?.kind === "emoji" &&
        !previous.some(
          (p) =>
            p.id === o.id &&
            p.icon?.kind === "emoji" &&
            p.icon.value === o.icon?.value
        )
          ? [o.icon.value]
          : []
      )
    );
    if (
      ids.size &&
      (await Emoji.count({
        where: { teamId: this.actor.teamId, id: [...ids] },
        transaction: this.transaction,
      })) !== ids.size
    ) {
      throw ValidationError("Choose a custom emoji from this workspace.");
    }
  }

  private async document(id: string, write: boolean) {
    const where = { teamId: this.actor.teamId, id, template: false };

    // Serialize writers before the first value exists; do not update the document row.
    const base = await Document.unscoped().findOne({
      where,
      attributes: ["id", "teamId", "archivedAt", "deletedAt", "collectionId"],
      lock: write ? this.transaction.LOCK.NO_KEY_UPDATE : undefined,
      transaction: this.transaction,
      rejectOnEmpty: true,
    });
    if (this.actor.kind !== "user") {
      if (base.collectionId) {
        const collection = await Collection.unscoped().findOne({
          where: { id: base.collectionId, teamId: this.actor.teamId },
          attributes: ["id", "archivedAt"],
          transaction: this.transaction,
        });
        if (!collection) {
          throw NotFoundError();
        }
        if (write && collection.archivedAt) {
          throw AuthorizationError();
        }
      }
      if (write && !base.isActive) {
        throw AuthorizationError();
      }
      return base;
    }
    const doc = await Document.findByPk(id, {
      userId: this.actor.user.id,
      includeViews: false,
      includeContent: false,
      transaction: this.transaction,
      rejectOnEmpty: true,
    });
    authorize(this.actor.user, write ? "update" : "read", doc);
    return doc;
  }

  private present({
    id,
    name,
    type,
    owner,
    access,
    options,
    key,
  }: PropertyDefinition) {
    return { id, name, type, owner, access, options, key };
  }

  private presentValue({
    documentId,
    definitionId,
    value,
    version,
  }: DocumentPropertyValue) {
    return { documentId, definitionId, value, version };
  }

  private async record(
    action: string,
    definitionId: string,
    documentId?: string
  ) {
    const { actor, transaction } = this;
    await PropertyAuditEvent.create(
      {
        action,
        teamId: actor.teamId,
        actorType:
          actor.kind === "installation" && actor.agentId ? "user" : actor.kind,
        actorId:
          actor.kind === "user"
            ? actor.user.id
            : actor.kind === "installation"
              ? (actor.agentId ?? actor.id)
              : null,
        definitionId,
        documentId: documentId ?? null,
      },
      { transaction }
    );
    await afterCommit(transaction, async () => {
      try {
        await websocketQueue().add({
          name: documentId
            ? "documentProperties.invalidate"
            : "propertyDefinitions.invalidate",
          teamId: actor.teamId,
          documentId,
        });
      } catch {
        Metrics.increment("properties.invalidation_failed");
        Logger.warn("Failed to schedule property invalidation", {
          teamId: actor.teamId,
          documentId,
        });
      }
    });
  }
}
