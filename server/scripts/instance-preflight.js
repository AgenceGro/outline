"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Sequelize } = require("sequelize");

// Use the same environment and connection settings as the following Sequelize CLI migration.
require("../../.sequelizerc");
const config =
  require("../config/database")[process.env.NODE_ENV || "development"];
const options = { ...config, logging: false };
const db = config.use_env_variable
  ? new Sequelize(process.env[config.use_env_variable], options)
  : new Sequelize(options);

db.query(
  fs.readFileSync(
    path.resolve(__dirname, "../config/instance-preflight.sql"),
    "utf8"
  )
)
  .catch((err) => {
    process.stderr.write(err.message + "\n");
    process.exitCode = 1;
  })
  .finally(() => db.close());
