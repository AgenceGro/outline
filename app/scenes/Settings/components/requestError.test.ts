import { requestErrorMessage } from "./requestError";

const fallback = "Something went wrong.";

describe("requestErrorMessage", () => {
  it("keeps messages from the server", () => {
    expect(requestErrorMessage(new Error("name: Too long"), fallback)).toEqual(
      "name: Too long"
    );
  });

  it("replaces bare status codes and empty messages", () => {
    expect(requestErrorMessage(new Error("Error 500"), fallback)).toEqual(
      fallback
    );
    expect(requestErrorMessage(new Error(""), fallback)).toEqual(fallback);
  });

  it("reads values that are not errors", () => {
    expect(requestErrorMessage("Offline", fallback)).toEqual("Offline");
  });
});
