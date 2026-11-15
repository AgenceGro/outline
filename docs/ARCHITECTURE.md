# Architecture

Outline is composed of a backend and frontend codebase in this monorepo. As both are written in TypeScript, they share some code where possible. We utilize the latest ES6 language features, including `async`/`await`, and types. oxfmt formatting and Oxlint are enforced by CI.

## Frontend

Outline's frontend is a React application compiled with [Vite](https://vitejs.dev/). It uses [MobX](https://mobx.js.org/) for state management and [Styled Components](https://www.styled-components.com/) for component styles. Unless global, state logic and styles are always co-located with React components together with their subcomponents to make the component tree easier to manage.

```
app
├── actions     - Reusable actions such as navigating, opening, creating entities
├── components  - React components reusable across scenes
├── editor      - React components specific to the editor
├── hooks       - Reusable React hooks
├── menus       - Context menus, often appear in multiple places in the UI
├── models      - State models using MobX observables
├── routes      - Route definitions, note that chunks are async loaded with suspense
├── scenes      - A scene represents a full-page view that contains several components
├── stores      - Collections of models and associated fetch logic
├── types       - TypeScript types
└── utils       - Utility methods specific to the frontend
```

## Backend

The API server is driven by [Koa](http://koajs.com/), it uses [Sequelize](http://docs.sequelizejs.com/) as the ORM and Redis with [Bull](https://github.com/OptimalBits/bull) for queues and async event management. Authorization logic
is contained in [cancan](https://www.npmjs.com/package/cancan) policies under the "policies" directory.

Interested in more documentation on the API routes? Check out the [API documentation](https://getoutline.com/developers).

```
server
├── routes            - All API routes are contained within here
│   ├── api           - API routes
│   └── auth          - Authentication routes
├── commands          - Complex commands that perform actions across multiple models
├── config            - Database configuration
├── emails            - Transactional email templates
│   └── templates     - Classes that define each possible email template
├── middlewares       - Shared Koa middlewares
├── migrations        - Database migrations
├── models            - Sequelize models
├── onboarding        - Markdown templates for onboarding documents
├── policies          - Authorization logic based on cancan
├── presenters        - JSON presenters for database models, the interface between backend -> frontend
├── queues            - Async queue definitions
│   └── processors    - Processors perform jobs on events from the event bus
│   └── tasks         - Tasks are arbitrary async jobs not from the event bus
├── services          - Services start distinct portions of the application eg api, worker
├── static            - Static assets
├── test              - Test helpers and fixtures, tests themselves are colocated
└── utils             - Utility methods specific to the backend
```

## Shared

Where logic is shared between the client and server it is placed in this directory. This is generally
small utilities.

```
shared
├── components        - Shared React components that are used in both the frontend and backend
├── editor            - The text editor, based on Prosemirror
├── i18n              - Internationalization configuration
│   └── locales       - Language specific translation files
├── styles            - Styles, colors and other global aesthetics
└── utils             - Shared utility methods
```

## Document properties

Property definitions belong to a workspace. A document stores a typed value and its version against the definition ID; select values store option IDs. Neither the definitions nor the assignments are part of ProseMirror, Yjs, or the document revision. Clients load current properties separately with `POST /api/documentProperties.list` and a `documentId`. Public shares, exports, and historical revisions do not load these values.

The definition types are `text`, `number`, `checkbox`, `date` (YYYY-MM-DD), `url` (HTTP or HTTPS), `singleSelect`, `multiSelect`, and `textList`. Workspace admins manage workspace definitions. Integrations manage their own definitions, and trusted Outline code can use the same property commands with an internal actor. Open values inherit the document's edit permissions. Managed values can be set or cleared only by the owner of the definition. Document readers, including directly invited guests, can read assigned values.

Calendar dates are stored as `YYYY-MM-DD` without a time or timezone. Each reader sees an absolute date in their interface language and their preferred short or long format (`propertyDateStyle`), alongside the number of calendar days from their local today. The user's choice does not change the document value.

### Altai instance agent

An installation has one team. Before upgrading, back up the database and run `node server/scripts/instance-preflight.js` with the server environment. Both startup and `yarn db:migrate` check for multiple team records, including pending deletions. If the check fails, the upgrade stops without selecting or merging teams. With one team, migration keeps its ID and existing data. With none, the first team creation provisions Altai and its collection in the same transaction. To roll back after provisioning, restore the backup.

Altai is a non-human administrator. It has no browser sign-in and consumes no seat. It can use ordinary Outline APIs to discover and administer private documents, including drafts. This access belongs to the agent identity; human administrators retain their existing document permissions. The properties API recognizes Altai as the existing definition owner and attributes agent writes to its user ID.

Operators run these commands from the built server with its usual database configuration:

```sh
yarn altai:key issue "Document processor"
yarn altai:key list
yarn altai:key revoke KEY_ID
```

Issuance prints the bearer secret once. Store it in the calling service’s secret store. To rotate, issue and test a replacement before revoking the old key by ID. Listing returns metadata only. The managed collection exists even with no active keys. Everyone signed in can read its published documents; drafts retain their usual privacy. Admins grant people or groups write access to the collection or a document subtree using the sharing controls. Only admins and Altai can administer access or move, archive, or delete managed content. Public share links do not resolve inside this collection.

Server permission and upgrade tests create and drop isolated temporary databases. The test database role needs permission to create databases; the production role does not. Cross-workspace policy fixtures run separately from tests against the production singleton constraints.

### Legacy Altai installation API

An admin enables the installation in workspace settings. The credential is returned once; send it only in an `Authorization: Bearer <credential>` header. Rotation replaces the credential without changing ownership; disabling it immediately prevents further access. The installation can read all non-trashed documents in its workspace, including personal documents and unpublished drafts. It cannot edit their prose, and archived documents are read-only.

All calls below are JSON POST requests under `/api/`. Responses place the result in `data`.

1. Discover documents using `integrationDocuments.list` with `offset` and `limit`. Fetch the title and current ProseMirror JSON body (`content`) with `integrationDocuments.info` and the document's `id`.
2. Provision a definition using `propertyDefinitions.create`. For example, the body below creates a managed status. Repeating the same installation key returns the existing definition. Use `propertyDefinitions.update` with its ID to change the label, options, or access rule.
3. Read `documentProperties.list` for the document and use the observed version in `documentProperties.set`: `{ "documentId": "…", "definitionId": "…", "version": 0, "value": "ready" }`. Use version zero only when the pair has never existed. To clear it, send the same identifiers and version to `documentProperties.clear` without a value. A clear retains the new version as a tombstone. On HTTP 409, refetch before deciding whether to overwrite.
4. Retire an option by setting `retired: true` or omitting it from the new options array. Existing assignments retain their labels. Deleting a definition using `propertyDefinitions.delete` removes its assignments workspace-wide. Authorized schema managers can get the affected-document count from `propertyDefinitions.list`.

```json
{
  "key": "project_status",
  "name": "Project status",
  "type": "singleSelect",
  "access": "managed",
  "options": [
    {
      "id": "processing",
      "label": "Altai is processing…",
      "shimmer": true
    },
    {
      "id": "ready",
      "label": "Ready",
      "color": "#009942",
      "icon": { "kind": "builtin", "value": "done" }
    }
  ]
}
```

Set `shimmer: true` on a single-select option to animate its label; omit it or use `false` for static text. The provider must still write the next status when processing finishes. A custom emoji uses `{ "kind": "emoji", "value": "<workspace emoji UUID>" }`. Colours and icons are independently optional. Changes to a definition appear everywhere it is used. The application WebSocket sends `documentProperties.invalidate` to document audiences and `propertyDefinitions.invalidate` to the workspace; neither event contains property values. Clients refetch through the authorized API after invalidation and reconnect.

Apply the document-properties migration before starting API or web processes with this feature. It adds tables and an index without backfilling documents. The legacy token stays disabled until an admin enables it. Enabling, rotating, or disabling it does not issue or revoke any agent key. The counters `properties.installation_auth_failed`, `properties.write_conflict`, and `properties.invalidation_failed` report rejected credentials, concurrent writes, and notification failures without including credentials, values, or prose.
