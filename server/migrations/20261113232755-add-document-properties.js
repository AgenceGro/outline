"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up({ sequelize }) {
    // Keep document writes available while building the composite FK target.
    await sequelize.query(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS documents_property_workspace ON documents ("teamId", id)'
    );
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `
        CREATE TABLE "propertyInstallations" (
          id uuid PRIMARY KEY, "teamId" uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          provider text NOT NULL, UNIQUE ("teamId", provider), UNIQUE ("teamId", provider, id),
          "tokenHash" text UNIQUE, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
        );
        CREATE TABLE "propertyDefinitions" (
          id uuid PRIMARY KEY, "teamId" uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          name text NOT NULL, type text NOT NULL, owner text NOT NULL, access text NOT NULL,
          key text, options jsonb NOT NULL DEFAULT '[]', "installationId" uuid,
          FOREIGN KEY ("teamId", owner, "installationId") REFERENCES "propertyInstallations" ("teamId", provider, id),
          CHECK ((owner IN ('workspace','outline')) = ("installationId" IS NULL)),
          CHECK (owner != 'workspace' OR (access = 'open' AND key IS NULL)),
          CHECK (owner = 'workspace' OR key IS NOT NULL),
          "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
          UNIQUE ("teamId", id), UNIQUE ("teamId", owner, key)
        );
        CREATE TABLE "documentPropertyValues" (
          id uuid PRIMARY KEY, "teamId" uuid NOT NULL, "documentId" uuid NOT NULL,
          "definitionId" uuid NOT NULL, value jsonb, version integer NOT NULL CHECK (version > 0),
          "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
          FOREIGN KEY ("teamId", "documentId") REFERENCES documents("teamId", id) ON DELETE CASCADE,
          FOREIGN KEY ("teamId", "definitionId") REFERENCES "propertyDefinitions"("teamId", id) ON DELETE CASCADE,
          UNIQUE ("documentId", "definitionId")
        );
        CREATE INDEX document_property_definition_values ON "documentPropertyValues" ("definitionId");
        CREATE TABLE "propertyAuditEvents" (
          id uuid PRIMARY KEY, "teamId" uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          "actorType" text NOT NULL, "actorId" uuid, action text NOT NULL,
          "documentId" uuid, "definitionId" uuid, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
        );
        CREATE INDEX property_audit_workspace_time ON "propertyAuditEvents" ("teamId", "createdAt")
      `,
        { transaction }
      );
    });
  },

  async down({ sequelize }) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        'DROP TABLE "propertyAuditEvents", "documentPropertyValues", "propertyDefinitions", "propertyInstallations"',
        { transaction }
      );
    });
    await sequelize.query(
      "DROP INDEX CONCURRENTLY documents_property_workspace"
    );
  },
};
