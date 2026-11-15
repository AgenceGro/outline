"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up({ sequelize }) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `
        LOCK TABLE teams IN SHARE ROW EXCLUSIVE MODE;
        DO $$ BEGIN
          IF (SELECT count(*) FROM teams) > 1 THEN
            RAISE EXCEPTION 'Multiple workspaces (including pending deletions). Separate or consolidate them before upgrading. No changes made.';
          END IF;
        END $$;

        CREATE UNIQUE INDEX teams_single_instance ON teams ((true));
        ALTER TABLE users ADD COLUMN agent text UNIQUE CHECK (agent = 'altai'),
          ADD CONSTRAINT agent_identity CHECK (agent IS NULL OR
            (role = 'admin' AND email IS NULL AND "jwtSecret" IS NULL AND
             "suspendedAt" IS NULL AND "deletedAt" IS NULL AND name = 'Altai'));
        ALTER TABLE collections ADD COLUMN "managedBy" text UNIQUE REFERENCES users(agent),
          ADD CONSTRAINT agent_collection CHECK ("managedBy" IS NULL OR
            (permission IS NOT DISTINCT FROM 'read' AND sharing = false AND
             "ownerId" IS NULL AND "archivedAt" IS NULL AND "deletedAt" IS NULL));

        CREATE FUNCTION protect_agent_identity() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            IF OLD.agent IS NOT NULL THEN RAISE EXCEPTION 'Cannot delete the Altai agent'; END IF;
            RETURN OLD;
          END IF;
          IF NEW.agent IS DISTINCT FROM OLD.agent OR
            (OLD.agent IS NOT NULL AND NEW."teamId" IS DISTINCT FROM OLD."teamId") THEN
            RAISE EXCEPTION 'Cannot change agent identity';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER protect_agent_identity BEFORE UPDATE OR DELETE ON users
          FOR EACH ROW EXECUTE FUNCTION protect_agent_identity();

        CREATE FUNCTION protect_agent_collection() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            IF OLD."managedBy" IS NOT NULL THEN RAISE EXCEPTION 'Cannot delete the Altai collection'; END IF;
            RETURN OLD;
          END IF;
          IF NEW."managedBy" IS DISTINCT FROM OLD."managedBy" OR
            (OLD."managedBy" IS NOT NULL AND (NEW."teamId", NEW."createdById") IS DISTINCT FROM (OLD."teamId", OLD."createdById")) THEN
            RAISE EXCEPTION 'Cannot change collection management';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER protect_agent_collection BEFORE UPDATE OR DELETE ON collections
          FOR EACH ROW EXECUTE FUNCTION protect_agent_collection();

        CREATE FUNCTION provision_altai(team_id uuid) RETURNS void LANGUAGE plpgsql AS $$
        DECLARE agent_id uuid;
        BEGIN
          INSERT INTO users (id, agent, name, role, "teamId", "createdAt", "updatedAt", "lastActiveAt")
          VALUES (gen_random_uuid(), 'altai', 'Altai', 'admin', team_id, now(), now(), now())
          ON CONFLICT (agent) DO NOTHING;
          SELECT id INTO STRICT agent_id FROM users WHERE agent='altai' AND "teamId"=team_id;
          INSERT INTO collections (id, "managedBy", name, "teamId", "createdById", "urlId", permission,
            sharing, sort, index, "documentStructure", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), 'altai', 'Altai', team_id, agent_id,
            left(replace(gen_random_uuid()::text,'-',''),10), 'read', false,
            '{"field":"index","direction":"asc"}', 'P' || replace(gen_random_uuid()::text,'-',''), '[]', now(), now())
          ON CONFLICT ("managedBy") DO NOTHING;
          INSERT INTO "propertyInstallations" (id, "teamId", provider, "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), team_id, 'altai', now(), now()) ON CONFLICT ("teamId", provider) DO NOTHING;
        END $$;
        CREATE FUNCTION provision_instance_after_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM provision_altai(NEW.id); RETURN NEW; END $$;
        CREATE TRIGGER provision_instance_after_insert AFTER INSERT ON teams
          FOR EACH ROW EXECUTE FUNCTION provision_instance_after_insert();
        SELECT provision_altai(id) FROM teams;
      `,
        { transaction }
      );
    });
  },

  async down() {
    throw new Error(
      "Restore the pre-upgrade backup; an agent with attributed content must not become a human admin."
    );
  },
};
