import { QueryTypes } from "sequelize";
import { beforeEach } from "vitest";
import { sequelize } from "@server/storage/database";

// First-sign-in tests require an empty installation. Only this serial project's
// disposable database may be reset; never truncate the configured test database.
beforeEach(async () => {
  const [row] = await sequelize.query<{ name: string }>(
    "SELECT current_database() AS name",
    { type: QueryTypes.SELECT }
  );
  if (!/^outline_test_fixtures_[a-f0-9]{32}$/.test(row.name)) {
    throw new Error("Provisioning tests require an isolated fixture database.");
  }
  await sequelize.query("TRUNCATE teams CASCADE");
});
