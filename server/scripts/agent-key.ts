import "./bootstrap";
import { manageAgentKey } from "@server/commands/agentKeys";
import { sequelize } from "@server/storage/database";

async function main() {
  const [action, arg, ...extra] = process.argv.slice(2);
  if (!extra.length && action === "issue" && arg?.trim()) {
    return manageAgentKey({ action, name: arg.trim() });
  }
  if (!extra.length && action === "revoke" && arg) {
    return manageAgentKey({ action, id: arg });
  }
  if (action === "list" && !arg) {
    return manageAgentKey({ action });
  }
  throw new Error(
    'Usage: yarn altai:key issue "Key name" | list | revoke KEY_ID'
  );
}

void main()
  .then(
    (result) => process.stdout.write(JSON.stringify(result) + "\n"),
    (err: Error) => {
      process.stderr.write(err.message + "\n");
      process.exitCode = 1;
    }
  )
  .finally(async () => {
    await sequelize.close();
    process.exit(process.exitCode ?? 0);
  });
