"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up({ sequelize }) {
    await sequelize.query(`
        CREATE FUNCTION require_human_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM users WHERE id = NEW."userId" AND agent IS NOT NULL) THEN
            RAISE EXCEPTION 'Agent users only accept operator-issued API keys';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER require_human BEFORE INSERT OR UPDATE OF "userId" ON user_passkeys
          FOR EACH ROW EXECUTE FUNCTION require_human_credentials();
        CREATE TRIGGER require_human BEFORE INSERT OR UPDATE OF "userId" ON user_authentications
          FOR EACH ROW EXECUTE FUNCTION require_human_credentials();
        CREATE TRIGGER require_human BEFORE INSERT OR UPDATE OF "userId" ON oauth_authentications
          FOR EACH ROW EXECUTE FUNCTION require_human_credentials();
        CREATE TRIGGER require_human BEFORE INSERT OR UPDATE OF "userId" ON oauth_authorization_codes
          FOR EACH ROW EXECUTE FUNCTION require_human_credentials();

    `);
  },
  async down({ sequelize }) {
    await sequelize.query("DROP FUNCTION require_human_credentials() CASCADE");
  },
};
