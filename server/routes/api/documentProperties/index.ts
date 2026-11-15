import Router from "@koa/router";
import { Op } from "sequelize";
import { AuthenticationType, UserRole } from "@shared/types";
import { DocumentProperties } from "@server/commands/documentProperties";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Collection, Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import type { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import pagination, { paginateQuery } from "../middlewares/pagination";
import {
  installedWorkspace,
  manageInstallation,
  propertyActor,
  propertyAuth,
} from "./authentication";
import { schemas } from "./schema";
import type { PropertyRequest } from "./schema";

const router = new Router();
function commands(ctx: APIContext) {
  return new DocumentProperties(propertyActor(ctx), ctx.state.transaction);
}

for (const action of ["info", "enable", "disable", "rotate"] as const) {
  router.post(
    `altaiInstallation.${action}`,
    rateLimiter(RateLimiterStrategy.OneHundredPerHour),
    auth({ role: UserRole.Admin, type: AuthenticationType.APP }),
    validate(schemas.empty),
    transaction(),
    async (ctx: APIContext) => {
      ctx.body = { data: await manageInstallation(ctx, action) };
    }
  );
}
router.post(
  "propertyDefinitions.list",
  propertyAuth,
  validate(schemas.empty),
  async (ctx: APIContext) => {
    ctx.body = { data: await commands(ctx).definitions() };
  }
);
router.post(
  "propertyDefinitions.create",
  propertyAuth,
  validate(schemas.create),
  async (ctx: APIContext<PropertyRequest<"create">>) => {
    ctx.body = { data: await commands(ctx).create(ctx.input.body) };
  }
);
router.post(
  "propertyDefinitions.update",
  propertyAuth,
  validate(schemas.update),
  async (ctx: APIContext<PropertyRequest<"update">>) => {
    ctx.body = { data: await commands(ctx).update(ctx.input.body) };
  }
);
router.post(
  "propertyDefinitions.delete",
  propertyAuth,
  validate(schemas.id),
  async (ctx: APIContext<PropertyRequest<"id">>) => {
    await commands(ctx).remove(ctx.input.body.id);
    ctx.body = { success: true };
  }
);
router.post(
  "documentProperties.list",
  propertyAuth,
  validate(schemas.list),
  async (ctx: APIContext<PropertyRequest<"list">>) => {
    ctx.body = { data: await commands(ctx).list(ctx.input.body.documentId) };
  }
);
router.post(
  "documentProperties.set",
  propertyAuth,
  validate(schemas.set),
  async (ctx: APIContext<PropertyRequest<"set">>) => {
    const { documentId, definitionId, version, value } = ctx.input.body;
    ctx.body = {
      data: await commands(ctx).write(documentId, definitionId, version, value),
    };
  }
);
router.post(
  "documentProperties.clear",
  propertyAuth,
  validate(schemas.clear),
  async (ctx: APIContext<PropertyRequest<"clear">>) => {
    const { documentId, definitionId, version } = ctx.input.body;
    ctx.body = {
      data: await commands(ctx).write(documentId, definitionId, version, null),
    };
  }
);

function discoverable(ctx: APIContext) {
  const teamId = installedWorkspace(ctx);
  return {
    where: {
      teamId,
      template: false,
      [Op.or]: [
        { collectionId: null },
        { "$collection.id$": { [Op.ne]: null } },
      ],
    },
    include: [
      {
        model: Collection.unscoped(),
        as: "collection",
        where: { teamId },
        attributes: [],
        required: false,
      },
    ],
    transaction: ctx.state.transaction,
  };
}
const metadata = [
  "id",
  "title",
  "collectionId",
  "publishedAt",
  "archivedAt",
  "updatedAt",
] as const;
router.post(
  "integrationDocuments.list",
  propertyAuth,
  pagination(),
  validate(schemas.empty),
  async (ctx: APIContext) => {
    const scope = discoverable(ctx);
    const { results, pagination: page } = await paginateQuery(
      ctx,
      (opts) =>
        Document.unscoped().findAll({
          ...scope,
          ...opts,
          attributes: [...metadata],
          order: [["id", "ASC"]],
        }),
      () => Document.unscoped().count(scope)
    );
    ctx.body = {
      data: results.map((d) => d.get({ plain: true })),
      pagination: page,
    };
  }
);
router.post(
  "integrationDocuments.info",
  propertyAuth,
  validate(schemas.id),
  async (ctx: APIContext<PropertyRequest<"id">>) => {
    const scope = discoverable(ctx);
    const doc = await Document.unscoped().findOne({
      ...scope,
      where: { ...scope.where, id: ctx.input.body.id },
      attributes: [...metadata, "text", "content", "state"],
      rejectOnEmpty: true,
    });
    ctx.body = {
      data: {
        id: doc.id,
        title: doc.title,
        collectionId: doc.collectionId,
        publishedAt: doc.publishedAt,
        archivedAt: doc.archivedAt,
        updatedAt: doc.updatedAt,
        content: await DocumentHelper.toJSON(doc),
      },
    };
  }
);
export default router;
