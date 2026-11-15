import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Sequelize } from "sequelize";
import type { TestProject } from "vitest/node";
import environment from "@server/utils/environment";

/**
 * Gives the cross-workspace policy fixtures their own disposable database.
 * Those suites model independent security domains side by side; only this
 * empty synthetic database omits singleton provisioning. The instance suite
 * runs against the real, unmodified schema.
 *
 * @param project the Vitest project owning the database and its workers.
 * @returns teardown that drops only the randomly named fixture database.
 */
export default async function setup(project: TestProject) {
  const base = environment.DATABASE_URL;
  if (!base || process.env.NODE_ENV !== "test") {
    throw new Error("The server fixture suite requires a test DATABASE_URL.");
  }
  const name = "outline_test_fixtures_" + randomUUID().replace(/-/g, "");
  const target = new URL(base);
  target.pathname = "/" + name;
  const admin = new Sequelize(base, { logging: false });
  await admin.query('CREATE DATABASE "' + name + '"');
  const drop = async () => {
    try {
      await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
    } finally {
      await admin.close();
    }
  };
  try {
    await promisify(execFile)(
      process.execPath,
      [
        "node_modules/sequelize-cli/lib/sequelize",
        "db:migrate",
        ...(project.name === "server-upgrade"
          ? ["--to", "20261113232755-add-document-properties.js"]
          : []),
      ],
      { env: { ...process.env, NODE_ENV: "test", DATABASE_URL: target.href } }
    );
    const fixture = new Sequelize(target.href, { logging: false });
    try {
      if (
        ["server", "server-shared", "server-provisioning"].includes(
          project.name
        )
      ) {
        await fixture.query(
          "DROP INDEX teams_single_instance; DROP TRIGGER provision_instance_after_insert ON teams;"
        );
      }
    } finally {
      await fixture.close();
    }
    project.provide("fixtureUrl", target.href);
    return drop;
  } catch (error) {
    await drop();
    throw error;
  }
}
