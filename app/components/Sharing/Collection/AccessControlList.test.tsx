import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { CollectionPermission, UserRole } from "@shared/types";
import { buildLightTheme } from "@shared/styles/theme";
import type Collection from "~/models/Collection";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { AccessControlList } from "./AccessControlList";

declare global {
  // oxlint-disable-next-line no-var -- React reads this global to enable act()
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const teamId = "70000000-0000-4000-8000-000000000000";
const adminId = "71111111-1111-4111-8111-111111111111";
const editorId = "72222222-2222-4222-8222-222222222222";
const agentId = "73333333-3333-4333-8333-333333333333";

let container: HTMLDivElement;
let root: Root;

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = globalThis.ResizeObserver;

class StubResizeObserver implements ResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

function collectionFor(id: string, managed: boolean) {
  const collection = stores.collections.add({
    id,
    name: managed ? "Altai" : "Ops",
    permission: CollectionPermission.Read,
    sharing: true,
    managedBy: managed ? "altai" : null,
  });
  stores.policies.add({ id, abilities: { manageUsers: true, share: true } });
  for (const userId of [editorId, agentId]) {
    stores.memberships.add({
      id: `${userId.slice(0, 8)}-${id.slice(9, 13)}-4000-8000-000000000000`,
      collectionId: id,
      userId,
      permission: CollectionPermission.ReadWrite,
    });
  }
  return collection;
}

async function render(collection: Collection, currentUserId: string) {
  runInAction(() => {
    stores.auth.currentUserId = currentUserId;
  });
  await act(async () => {
    root.render(
      <Provider rootStore={stores}>
        <ThemeProvider theme={buildLightTheme({})}>
          <MemoryRouter>
            <ActionContextProvider>
              <AccessControlList
                collection={collection}
                share={null}
                invitedInSession={[]}
                visible
                loading={false}
              />
            </ActionContextProvider>
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );
  });
}

function permissionButton() {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Can edit"
  );
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  globalThis.ResizeObserver = StubResizeObserver;
  // Signed-out auth hydration leaves an empty user in the store, which can't
  // be ordered by name.
  stores.users.clear();
  runInAction(() => {
    stores.auth.add({ id: teamId, name: "Team", sharing: true });
    stores.auth.currentTeamId = teamId;
  });
  stores.users.add({ id: adminId, name: "Admin", role: UserRole.Admin });
  stores.users.add({ id: editorId, name: "Edie", role: UserRole.Member });
  stores.users.add({ id: agentId, name: "Altai agent", agent: "altai" });
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
  globalThis.ResizeObserver = originalResizeObserver;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("collection access list", () => {
  it("explains managed access and offers no public link", async () => {
    await render(
      collectionFor("74444444-4444-4444-8444-444444444444", true),
      adminId
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Managed by Altai");
    expect(text).toContain("Everyone signed in can read published documents");
    expect(text).toContain("Everyone signed in");
    expect(text).toContain("Drafts stay private");
    expect(text).not.toContain("All members");
    expect(text).not.toContain("Publish to web");
  });

  it("shows people with access, but not the agent", async () => {
    await render(
      collectionFor("75555555-5555-4555-8555-555555555555", true),
      adminId
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Edie");
    expect(text).not.toContain("Altai agent");
  });

  it("lets only admins change edit access on managed content", async () => {
    const collection = collectionFor(
      "76666666-6666-4666-8666-666666666666",
      true
    );

    await render(collection, adminId);
    expect(permissionButton()?.disabled).toBe(false);

    await render(collection, editorId);
    expect(permissionButton()?.disabled).toBe(true);
  });

  it("keeps the usual controls on unmanaged content", async () => {
    await render(
      collectionFor("77777777-7777-4777-8777-777777777777", false),
      editorId
    );
    const text = container.textContent ?? "";

    expect(text).toContain("All members");
    expect(text).toContain("Publish to web");
    expect(text).not.toContain("Managed by Altai");
    expect(permissionButton()?.disabled).toBe(false);
  });
});
