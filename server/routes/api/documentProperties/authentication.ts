import type { Next } from "koa";
import { randomBytes } from "node:crypto";
import {
  AuthenticationError,
  AuthorizationError,
  DocumentConflictError,
} from "@server/errors";
import Metrics from "@server/logging/Metrics";
import { transaction as withTransaction } from "@server/middlewares/transaction";
import auth, { parseAuthentication } from "@server/middlewares/authentication";
import { PropertyInstallation, PropertyAuditEvent, Team } from "@server/models";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
import { hash } from "@server/utils/crypto";
import type { PropertyActor } from "@server/commands/documentProperties";

const prefix = "ol_install_";

/**
 * Authenticates an installation only on explicitly opted-in property routes.
 *
 * @param ctx the current API context.
 * @param next the authorized handler.
 * @returns the downstream result.
 */
export async function propertyAuth(ctx: APIContext, next: Next) {
  const { token, transport } = parseAuthentication(ctx);
  if (!token?.startsWith(prefix)) {
    // User authentication performs its own database reads before acquiring a
    // transaction connection. Reserving that connection first can starve the pool.
    return auth()(ctx, () =>
      withTransaction()(ctx, async () => {
        const { user } = ctx.state.auth;
        if (user.agent) {
          ctx.state.propertyInstallation = await PropertyInstallation.findOne({
            where: { teamId: user.teamId, provider: user.agent },
            transaction: ctx.state.transaction,
            rejectOnEmpty: true,
          });
        }
        return next();
      })
    );
  }
  if (transport !== "header") {
    throw AuthenticationError(
      "Use a bearer credential in the Authorization header."
    );
  }
  return withTransaction()(ctx, async () => {
    const { transaction } = ctx.state;
    const installation = await PropertyInstallation.findOne({
      where: { tokenHash: hash(token) },
      transaction,
      lock: transaction.LOCK.SHARE,
    });
    const team =
      installation &&
      (await Team.findByPk(installation.teamId, {
        attributes: ["id", "suspendedAt"],
        transaction,
      }));
    if (!installation || !team || team.isSuspended) {
      Metrics.increment("properties.installation_auth_failed");
      throw AuthenticationError("Invalid installation credential.");
    }
    ctx.state.propertyInstallation = installation;
    return next();
  });
}

/**
 * Resolves the property owner from trusted session state.
 *
 * @param ctx the authenticated property request.
 * @returns the identity used by property commands.
 */
export function propertyActor(ctx: APIContext): PropertyActor {
  const installation = ctx.state.propertyInstallation;
  if (installation) {
    return {
      kind: "installation",
      provider: installation.provider,
      teamId: installation.teamId,
      id: installation.id,
      agentId: ctx.state.auth?.user?.agent ? ctx.state.auth.user.id : undefined,
    };
  }
  const user = ctx.state.auth?.user;
  if (!user) {
    throw AuthenticationError();
  }
  return { kind: "user", user, teamId: user.teamId };
}

/**
 * Changes credential state without changing installation identity.
 *
 * @param ctx the authenticated admin request.
 * @param action the requested operation.
 * @returns the installation status and a new credential only at issuance.
 */
export async function manageInstallation(
  ctx: APIContext,
  action: "enable" | "disable" | "rotate" | "info"
) {
  const { user } = ctx.state.auth;
  authorize(user, "update", user.team);
  const { transaction } = ctx.state;
  const teamId = user.teamId;
  if (action !== "info") {
    await Team.findByPk(teamId, {
      attributes: ["id"],
      lock: transaction.LOCK.NO_KEY_UPDATE,
      transaction,
      rejectOnEmpty: true,
    });
  }
  const installation = await PropertyInstallation.findOne({
    where: { teamId, provider: "altai" },
    transaction,
    lock: action !== "info",
  });
  if (action === "info") {
    return { enabled: !!installation?.tokenHash };
  }
  if (action === "enable" && installation?.tokenHash) {
    throw DocumentConflictError("Altai is already enabled.");
  }
  if (action === "rotate" && !installation?.tokenHash) {
    throw DocumentConflictError("Enable Altai before rotating its credential.");
  }
  const token =
    action === "disable"
      ? undefined
      : prefix + randomBytes(32).toString("base64url");
  const tokenHash = token ? hash(token) : null;
  if (installation) {
    await installation.update({ tokenHash }, { transaction });
  } else if (token) {
    await PropertyInstallation.create(
      { teamId, provider: "altai", tokenHash },
      { transaction }
    );
  }
  await PropertyAuditEvent.create(
    {
      teamId,
      actorType: "user",
      actorId: user.id,
      action: `installation.${action}`,
    },
    { transaction }
  );
  ctx.set("Cache-Control", "no-store");
  return { enabled: !!token, token };
}

/**
 * Requires an installation and returns its workspace.
 *
 * @param ctx the authenticated property request.
 * @returns the installation workspace ID.
 */
export function installedWorkspace(ctx: APIContext) {
  if (!ctx.state.propertyInstallation) {
    throw AuthorizationError();
  }
  return ctx.state.propertyInstallation.teamId;
}
