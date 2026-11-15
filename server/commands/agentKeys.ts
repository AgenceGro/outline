import { ApiKey, User } from "@server/models";
import { ValidationError } from "@server/errors";

type KeyCommand =
  | { action: "issue"; name: string }
  | { action: "list" }
  | { action: "revoke"; id: string };

/**
 * Operates keys for the provisioned instance agent, exclusively from the CLI.
 *
 * @param command the requested operator action.
 * @returns metadata, plus the secret only on initial issuance.
 */
export async function manageAgentKey(command: KeyCommand) {
  const agent = await User.findOne({
    where: { agent: "altai" },
    rejectOnEmpty: true,
  });
  if (command.action === "list") {
    return ApiKey.findAll({
      where: { userId: agent.id },
      attributes: ["id", "name", "last4", "createdAt", "lastActiveAt"],
      order: [["createdAt", "ASC"]],
      raw: true,
    });
  }
  if (command.action === "issue") {
    const key = await ApiKey.create({ userId: agent.id, name: command.name });
    return { id: key.id, name: key.name, token: key.value };
  }
  const removed = await ApiKey.destroy({
    where: { id: command.id, userId: agent.id },
  });
  if (!removed) {
    throw ValidationError("No active Altai key with that ID.");
  }
  return { revoked: command.id };
}
