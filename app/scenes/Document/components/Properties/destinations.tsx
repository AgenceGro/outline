import { GlobeIcon } from "outline-icons";
import styled from "styled-components";
import { s } from "@shared/styles";
import { cdnPath } from "@shared/utils/urls";
import { GmailIcon } from "~/components/Icons/GmailIcon";
import { OutlookIcon } from "~/components/Icons/OutlookIcon";

/** A known service a link opens in, and the logo shipped with the app. */
export interface Destination {
  /** The name of the service. */
  name: string;
  /** A bundled logo image, or a monochrome logo component. */
  logo: { image: string } | { glyph: typeof GmailIcon };
}

/** Whether a host is the domain itself or one of its subdomains. */
const onDomain = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

/**
 * Known services, matched on the link's exact host or a real subdomain of
 * it, so a look-alike such as `slack.com.example.org` or `evilslack.com` is
 * never matched. Google documents share a host and differ by path.
 */
const destinations: {
  matches: (host: string, path: string) => boolean;
  destination: Destination;
}[] = [
  {
    matches: (host) => onDomain(host, "slack.com"),
    destination: { name: "Slack", logo: { image: "/images/slack.png" } },
  },
  {
    matches: (host) => host === "mail.google.com" || host === "gmail.com",
    destination: { name: "Gmail", logo: { glyph: GmailIcon } },
  },
  {
    matches: (host) =>
      onDomain(host, "outlook.com") ||
      host === "outlook.live.com" ||
      host === "outlook.office.com" ||
      host === "outlook.office365.com" ||
      host === "outlook.cloud.microsoft",
    destination: { name: "Outlook", logo: { glyph: OutlookIcon } },
  },
  {
    matches: (host) => host === "calendar.google.com",
    destination: {
      name: "Google Calendar",
      logo: { image: "/images/google-calendar.png" },
    },
  },
  {
    matches: (host, path) =>
      host === "docs.google.com" && path.startsWith("/document/"),
    destination: {
      name: "Google Docs",
      logo: { image: "/images/google-docs.png" },
    },
  },
  {
    matches: (host, path) =>
      host === "docs.google.com" && path.startsWith("/spreadsheets/"),
    destination: {
      name: "Google Sheets",
      logo: { image: "/images/google-sheets.png" },
    },
  },
  {
    matches: (host, path) =>
      host === "docs.google.com" && path.startsWith("/presentation/"),
    destination: {
      name: "Google Slides",
      logo: { image: "/images/google-slides.png" },
    },
  },
  {
    matches: (host) => host === "drive.google.com",
    destination: {
      name: "Google Drive",
      logo: { image: "/images/google-drive.png" },
    },
  },
  {
    matches: (host) => onDomain(host, "figma.com"),
    destination: { name: "Figma", logo: { image: "/images/figma.png" } },
  },
  {
    matches: (host) => onDomain(host, "trello.com"),
    destination: { name: "Trello", logo: { image: "/images/trello.png" } },
  },
  {
    matches: (host) => onDomain(host, "miro.com"),
    destination: { name: "Miro", logo: { image: "/images/miro.png" } },
  },
  {
    matches: (host) => onDomain(host, "loom.com"),
    destination: { name: "Loom", logo: { image: "/images/loom.png" } },
  },
  {
    matches: (host) => onDomain(host, "dropbox.com"),
    destination: { name: "Dropbox", logo: { image: "/images/dropbox.png" } },
  },
  {
    matches: (host) => onDomain(host, "youtube.com") || host === "youtu.be",
    destination: { name: "YouTube", logo: { image: "/images/youtube.png" } },
  },
];

/**
 * Finds the known service a web link opens in.
 *
 * @param url the link.
 * @returns the service, or undefined for other links and invalid URLs.
 */
export function destinationFor(url: string): Destination | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  const host = parsed.hostname.replace(/\.$/, "");
  return destinations.find((entry) => entry.matches(host, parsed.pathname))
    ?.destination;
}

/** The size of a logo, in pixels. */
const size = 16;

/**
 * The logo of the service a link opens in, or a globe for other links. It
 * is decorative: the link's text already says where it goes.
 *
 * @param props.url the link.
 * @returns the logo.
 */
export function DestinationIcon({ url }: { url: string }) {
  const destination = destinationFor(url);
  const logo = destination?.logo;
  return (
    <Box aria-hidden="true" data-destination={destination?.name ?? "link"}>
      {!logo ? (
        <GlobeIcon size={20} color="currentColor" />
      ) : "image" in logo ? (
        <Logo src={cdnPath(logo.image)} alt="" width={size} height={size} />
      ) : (
        <logo.glyph size={20} />
      )}
    </Box>
  );
}

/**
 * Holds the logo beside the link's first line. Glyphs are drawn larger than
 * the box, since their artwork is padded, so every logo reads the same size.
 */
const Box = styled.span`
  display: inline-grid;
  flex: none;
  place-items: center;
  width: ${size}px;
  height: ${size}px;
  margin-block: calc((1lh - ${size}px) / 2);
  color: ${s("textSecondary")};

  svg {
    margin: -2px;
  }
`;

const Logo = styled.img`
  display: block;
  width: ${size}px;
  height: ${size}px;
  border-radius: 3px;
`;
