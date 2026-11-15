import { destinationFor } from "./destinations";

const name = (url: string) => destinationFor(url)?.name;

describe("destinationFor", () => {
  it("recognizes known services on their exact hosts and subdomains", () => {
    expect(name("https://slack.com/")).toBe("Slack");
    expect(name("https://acme.slack.com/archives/C123/p456")).toBe("Slack");
    expect(name("https://app.slack.com/client/T1/C2")).toBe("Slack");
    expect(name("https://mail.google.com/mail/u/0/#inbox/FMfcg")).toBe("Gmail");
    expect(name("https://outlook.office.com/mail/inbox/id/AAQk")).toBe(
      "Outlook"
    );
    expect(name("https://outlook.office365.com/owa/")).toBe("Outlook");
    expect(name("https://outlook.live.com/mail/0/")).toBe("Outlook");
    expect(name("https://outlook.cloud.microsoft/mail/")).toBe("Outlook");
    expect(name("https://calendar.google.com/calendar/u/0/r/eventedit/x")).toBe(
      "Google Calendar"
    );
    expect(name("https://docs.google.com/document/d/1/edit")).toBe(
      "Google Docs"
    );
    expect(name("https://docs.google.com/spreadsheets/d/1/edit")).toBe(
      "Google Sheets"
    );
    expect(name("https://docs.google.com/presentation/d/1/edit")).toBe(
      "Google Slides"
    );
    expect(name("https://drive.google.com/drive/folders/1")).toBe(
      "Google Drive"
    );
    expect(name("https://www.figma.com/design/abc")).toBe("Figma");
    expect(name("https://youtu.be/dQw4w9WgXcQ")).toBe("YouTube");
  });

  it("ignores case and a trailing dot in the host", () => {
    expect(name("https://ACME.Slack.COM/archives/C1")).toBe("Slack");
    expect(name("https://slack.com./archives/C1")).toBe("Slack");
  });

  it("never matches look-alike hosts", () => {
    expect(name("https://slack.com.example.org/")).toBeUndefined();
    expect(name("https://evilslack.com/")).toBeUndefined();
    expect(name("https://slack-com.example.org/")).toBeUndefined();
    expect(name("https://mail.google.com.example.org/")).toBeUndefined();
    expect(name("https://notoutlook.com/")).toBeUndefined();
    expect(name("https://outlook.office.com.example.org/")).toBeUndefined();
    expect(name("https://outlook.live.com.example.org/")).toBeUndefined();
    expect(
      name("https://outlook.cloud.microsoft.example.org/")
    ).toBeUndefined();
    expect(name("https://live.com/")).toBeUndefined();
    expect(name("https://example.org/slack.com")).toBeUndefined();
    expect(name("https://slack.com@example.org/")).toBeUndefined();
    expect(name("https://example.org/?u=https://slack.com")).toBeUndefined();
  });

  it("matches Google documents by path, and other Google hosts not at all", () => {
    expect(name("https://docs.google.com/forms/d/1")).toBeUndefined();
    expect(name("https://google.com/calendar")).toBeUndefined();
  });

  it("ignores links that are not web links", () => {
    expect(name("mailto:someone@slack.com")).toBeUndefined();
    expect(name("slack://channel?team=T1")).toBeUndefined();
    expect(name("not a link")).toBeUndefined();
    expect(name("https://example.org/")).toBeUndefined();
  });
});
