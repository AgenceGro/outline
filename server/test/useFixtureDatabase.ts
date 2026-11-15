import { inject } from "vitest";

declare module "vitest" {
  interface ProvidedContext {
    fixtureUrl: string;
  }
}

const url = inject("fixtureUrl");
if (!/^\/outline_test_fixtures_[a-f0-9]{32}$/.test(new URL(url).pathname)) {
  throw new Error("An isolated fixture database is required.");
}
process.env.DATABASE_URL = url;
process.env.DATABASE_CONNECTION_POOL_URL = url;
process.env.DATABASE_READ_ONLY_URL = url;
