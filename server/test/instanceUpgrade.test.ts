import { readFile } from "node:fs/promises";
import { QueryTypes, Sequelize } from "sequelize";
import { inject } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const db = new Sequelize(inject("fixtureUrl"), { logging: false });
afterAll(() => db.close());

const migrate = () =>
  promisify(execFile)(process.execPath, [
    "node_modules/sequelize-cli/lib/sequelize",
    "db:migrate",
  ]);

it("refuses two teams before mutation, adopts the surviving team, and provisions idempotently", async () => {
  const createTeam = () =>
    db.query<{ id: string }>(
      'INSERT INTO teams(id,name,"createdAt","updatedAt") VALUES(gen_random_uuid(),\'Fixture\',now(),now()) RETURNING id',
      { type: QueryTypes.SELECT }
    );
  const [first] = await createTeam();
  const [other] = await createTeam();
  await db.query('UPDATE teams SET "deletedAt"=now() WHERE id=:id', {
    replacements: other,
  });
  const preflight = await readFile(
    "server/config/instance-preflight.sql",
    "utf8"
  );
  await expect(db.query(preflight)).rejects.toThrow("Multiple workspaces");
  await expect(migrate()).rejects.toThrow("Multiple workspaces");
  expect(
    await db.getQueryInterface().describeTable("users")
  ).not.toHaveProperty("agent");
  await db.query("DELETE FROM teams WHERE id=:id", { replacements: other });
  await db.query(preflight);
  await migrate();
  const identity = () =>
    db.query<{ id: string; collectionId: string }>(
      'SELECT u.id,c.id AS "collectionId" FROM users u JOIN collections c ON c."managedBy"=u.agent WHERE u."teamId"=:id AND u.agent=\'altai\'',
      { type: QueryTypes.SELECT, replacements: first }
    );
  const before = await identity();
  expect(before).toHaveLength(1);
  await Promise.all(
    [1, 2].map(() =>
      db.query("SELECT provision_altai(:id)", { replacements: first })
    )
  );
  expect(await identity()).toEqual(before);
  await expect(createTeam()).rejects.toThrow();
});
