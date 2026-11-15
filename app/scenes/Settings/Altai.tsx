import { observer } from "mobx-react";
import { BuildingBlocksIcon, CheckmarkIcon, CopyIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import CopyToClipboard from "~/components/CopyToClipboard";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import PlaceholderText from "~/components/PlaceholderText";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import {
  fetchAltaiInstallation,
  performAltaiAction,
} from "./components/altaiInstallationApi";
import type { AltaiAction } from "./components/altaiInstallationState";
import {
  altaiInstallationReducer,
  initialAltaiInstallationState,
  isAltaiConflict,
} from "./components/altaiInstallationState";
import { InlineAlert } from "./components/InlineAlert";
import { IntegrationScene } from "./components/IntegrationScene";
import { LiveRegion, useLiveAnnouncer } from "./components/LiveRegion";
import { requestErrorMessage } from "./components/requestError";
import { SettingsSection } from "./components/SettingsSection";

/**
 * Admin settings page that explains the Altai agent and manages the legacy
 * scoped token: enable it, rotate it, or disable it. Agent and operator keys
 * are managed only from the command line and never appear here. The one-time
 * scoped token lives only in this component's state.
 *
 * @returns the Altai settings scene.
 */
export const Altai = observer(function Altai() {
  const { t } = useTranslation();
  const { collections, dialogs } = useStores();
  const managedCollection = collections.orderedData.find(
    (collection) => collection.isManaged
  );
  const [state, dispatch] = React.useReducer(
    altaiInstallationReducer,
    initialAltaiInstallationState
  );
  const { message, announce } = useLiveAnnouncer();
  const [copied, setCopied] = React.useState(false);
  const scopeId = React.useId();
  const tokenHeadingId = React.useId();
  const tokenNoteId = React.useId();
  const tokenHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const statusHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const rotateButtonRef = React.useRef<HTMLButtonElement>(null);
  const disableButtonRef = React.useRef<HTMLButtonElement>(null);
  const isMounted = React.useRef(false);

  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const load = React.useCallback(async () => {
    dispatch({ type: "loadStarted" });
    try {
      const data = await fetchAltaiInstallation();
      if (isMounted.current) {
        dispatch({ type: "loadSucceeded", data });
      }
    } catch (err) {
      if (isMounted.current) {
        dispatch({
          type: "loadFailed",
          message: requestErrorMessage(err, t("Something went wrong")),
        });
      }
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const run = React.useCallback(
    async (action: AltaiAction) => {
      dispatch({ type: "actionStarted", action });
      setCopied(false);
      try {
        const data = await performAltaiAction(action);
        if (!isMounted.current) {
          return;
        }
        dispatch({ type: "actionSucceeded", action, data });
        announce(
          action === "enable"
            ? t("The scoped token is enabled. Copy it now.")
            : action === "rotate"
              ? t("The scoped token was replaced. Copy the new token now.")
              : t("The scoped token is disabled.")
        );
        requestAnimationFrame(() => {
          if (data.token) {
            tokenHeadingRef.current?.focus();
          } else {
            statusHeadingRef.current?.focus();
          }
        });
      } catch (err) {
        const message = requestErrorMessage(err, t("Something went wrong"));
        let enabledNow: boolean | undefined;
        try {
          enabledNow = (await fetchAltaiInstallation()).enabled;
        } catch {
          enabledNow = undefined;
        }
        if (!isMounted.current) {
          return;
        }
        if (enabledNow !== undefined && isAltaiConflict(action, enabledNow)) {
          dispatch({ type: "actionConflicted", action, enabled: enabledNow });
          announce(
            enabledNow
              ? t("The scoped token is already enabled.")
              : t("The scoped token is disabled.")
          );
        } else {
          dispatch({ type: "actionFailed", action, message });
        }
      }
    },
    [announce, t]
  );

  const confirm = React.useCallback(
    (
      action: "rotate" | "disable",
      trigger: React.RefObject<HTMLButtonElement | null>
    ) => {
      const isRotate = action === "rotate";
      const restoreFocus = () => setTimeout(() => trigger.current?.focus(), 0);

      dialogs.openModal({
        title: isRotate
          ? t("Rotate the scoped token?")
          : t("Disable the scoped token?"),
        onClose: restoreFocus,
        content: (
          <ConfirmationDialog
            danger={!isRotate}
            submitText={
              isRotate ? t("Rotate token") : t("Disable scoped token")
            }
            onSubmit={() => {
              restoreFocus();
              void run(action);
            }}
          >
            {isRotate
              ? t(
                  "The current scoped token stops working right away. Anything that uses it can’t connect until you give it the new token. The Altai agent and its keys are not affected."
                )
              : t(
                  "The scoped token stops working right away. The Altai agent and its keys are not affected. You can enable the scoped token again later with a new token."
                )}
          </ConfirmationDialog>
        ),
      });
    },
    [dialogs, run, t]
  );

  const handleEnable = React.useCallback(() => {
    void run("enable");
  }, [run]);

  const handleRotate = React.useCallback(() => {
    confirm("rotate", rotateButtonRef);
  }, [confirm]);

  const handleDisable = React.useCallback(() => {
    confirm("disable", disableButtonRef);
  }, [confirm]);

  const handleRetryAction = React.useCallback(() => {
    if (state.failedAction) {
      void run(state.failedAction);
    }
  }, [run, state.failedAction]);

  const handleCopied = React.useCallback(() => {
    setCopied(true);
    announce(t("Token copied"));
  }, [announce, t]);

  const handleHideToken = React.useCallback(() => {
    dispatch({ type: "tokenDismissed" });
    setCopied(false);
    requestAnimationFrame(() => statusHeadingRef.current?.focus());
  }, []);

  const actionErrorTitle =
    state.failedAction === "enable"
      ? t("The scoped token couldn’t be enabled")
      : state.failedAction === "rotate"
        ? t("The scoped token couldn’t be rotated")
        : t("The scoped token couldn’t be disabled");

  const conflictMessage =
    state.conflict === "enable"
      ? t(
          "The scoped token was already enabled, so no new token was issued. Rotate the token if you need one."
        )
      : state.conflict === "rotate"
        ? t(
            "The scoped token was disabled before it could be rotated. Enable the scoped token to get a new one."
          )
        : state.conflict === "disable"
          ? t("The scoped token was already disabled.")
          : null;

  const scope = (
    <ScopePanel id={scopeId} aria-label={t("What the scoped token can access")}>
      <ScopeTitle as="h3">{t("What the scoped token can access")}</ScopeTitle>
      <ScopeList>
        <li>
          {t(
            "Reads every document in the workspace, including private documents and drafts."
          )}
        </li>
        <li>{t("Can’t edit the text of any document.")}</li>
        <li>{t("Can be rotated or disabled here at any time.")}</li>
      </ScopeList>
    </ScopePanel>
  );

  return (
    <IntegrationScene title="Altai" icon={<BuildingBlocksIcon />}>
      <Heading>Altai</Heading>
      <Text as="p" type="secondary">
        {t(
          "Altai works in this Outline instance through a single agent account."
        )}
      </Text>
      <LiveRegion message={message} />

      <SettingsSection
        title={t("Altai agent")}
        description={t(
          "Edits and comments that Altai makes show its name. It manages a collection where everyone signed in can read published documents, while drafts stay private. Only admins can give people and groups edit access to it."
        )}
      >
        <Region>
          {managedCollection && (
            <Text as="p">
              <Link to={managedCollection.path}>
                {t("Open {{ collectionName }}", {
                  collectionName: managedCollection.displayName,
                })}
              </Link>
            </Text>
          )}
          <ScopePanel aria-label={t("Agent and operator keys")}>
            <ScopeTitle as="h3">{t("Agent and operator keys")}</ScopeTitle>
            <ScopeList>
              <li>{t("Have full access to this Outline instance.")}</li>
              <li>
                {t(
                  "Are created and revoked only from the command line, and are never shown on this page."
                )}
              </li>
            </ScopeList>
          </ScopePanel>
        </Region>
      </SettingsSection>

      <SettingsSection
        title={t("Scoped token (legacy)")}
        description={t(
          "An older way to connect Altai, limited to reading documents and managing its document properties. The agent and its keys don’t depend on it."
        )}
      >
        {state.load === "loading" && (
          <Region
            aria-busy="true"
            aria-label={t("Loading scoped token status")}
          >
            <PlaceholderText header />
            <PlaceholderText />
            <PlaceholderText maxWidth={60} />
          </Region>
        )}

        {state.load === "failed" && (
          <InlineAlert
            title={t("We couldn’t check whether the scoped token is enabled")}
            retryLabel={t("Try again")}
            onRetry={load}
          >
            {state.errorMessage}
          </InlineAlert>
        )}

        {state.load === "loaded" && (
          <Region>
            <StatusRow>
              <StatusHeading ref={statusHeadingRef} tabIndex={-1} as="h3">
                {state.enabled
                  ? t("The scoped token is enabled")
                  : t("The scoped token is disabled")}
              </StatusHeading>
              <StatusMark $on={state.enabled}>
                {state.enabled ? t("Enabled") : t("Disabled")}
              </StatusMark>
            </StatusRow>

            {conflictMessage && (
              <Text as="p" size="small" type="secondary" role="status">
                {conflictMessage}
              </Text>
            )}

            {state.token && (
              <TokenPanel aria-labelledby={tokenHeadingId}>
                <ScopeTitle
                  as="h3"
                  id={tokenHeadingId}
                  ref={tokenHeadingRef}
                  tabIndex={-1}
                >
                  {t("Copy the scoped token")}
                </ScopeTitle>
                <Text as="p" size="small" type="secondary" id={tokenNoteId}>
                  {t(
                    "Paste it into Altai now. For security, it won’t be shown again after you leave this page."
                  )}
                </Text>
                <TokenRow>
                  <TokenInput
                    readOnly
                    value={state.token}
                    label={t("Token")}
                    labelHidden
                    aria-describedby={tokenNoteId}
                    spellCheck={false}
                    autoComplete="off"
                    margin={0}
                  />
                  <CopyToClipboard text={state.token} onCopy={handleCopied}>
                    <Button
                      type="button"
                      icon={copied ? <CheckmarkIcon /> : <CopyIcon />}
                    >
                      {copied ? t("Copied") : t("Copy token")}
                    </Button>
                  </CopyToClipboard>
                </TokenRow>
                <div>
                  <Button type="button" neutral onClick={handleHideToken}>
                    {t("Hide token")}
                  </Button>
                </div>
              </TokenPanel>
            )}

            {state.tokenMissing && (
              <InlineAlert
                title={t(
                  "The scoped token is enabled, but no token was returned"
                )}
                retryLabel={t("Rotate token")}
                onRetry={handleRotate}
              >
                {t("Rotate the token to get a new one.")}
              </InlineAlert>
            )}

            {scope}

            {state.failedAction && (
              <InlineAlert
                title={actionErrorTitle}
                retryLabel={t("Try again")}
                onRetry={handleRetryAction}
                retrying={state.pending !== null}
              >
                {state.errorMessage}
              </InlineAlert>
            )}

            <Actions>
              {state.enabled ? (
                <>
                  <Button
                    ref={rotateButtonRef}
                    type="button"
                    neutral
                    onClick={handleRotate}
                    disabled={state.pending !== null}
                  >
                    {state.pending === "rotate"
                      ? `${t("Rotating token")}…`
                      : t("Rotate token")}
                  </Button>
                  <Button
                    ref={disableButtonRef}
                    type="button"
                    danger
                    onClick={handleDisable}
                    disabled={state.pending !== null}
                  >
                    {state.pending === "disable"
                      ? `${t("Disabling")}…`
                      : t("Disable scoped token")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={handleEnable}
                  disabled={state.pending !== null}
                  aria-describedby={scopeId}
                >
                  {state.pending === "enable"
                    ? `${t("Enabling")}…`
                    : t("Enable scoped token")}
                </Button>
              )}
            </Actions>
          </Region>
        )}
      </SettingsSection>
    </IntegrationScene>
  );
});

const Region = styled.div`
  display: grid;
  gap: 16px;
  margin-top: 16px;

  p {
    margin: 0;
  }

  > * {
    min-width: 0;
  }
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
`;

const StatusHeading = styled(Text)`
  margin: 0;
  font-size: 18px;
  font-weight: 500;

  &:focus {
    outline: none;
  }
`;

const StatusMark = styled.span<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: ${(props) =>
    props.$on ? props.theme.text : props.theme.textSecondary};

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${(props) =>
      props.$on ? props.theme.brand.green : props.theme.textTertiary};
  }
`;

const ScopePanel = styled.section`
  padding: 16px 20px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
  background: ${s("backgroundSecondary")};
`;

const ScopeTitle = styled(Text)`
  display: block;
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 500;

  &:focus {
    outline: none;
  }
`;

const ScopeList = styled.ul`
  margin: 0;
  padding-inline-start: 20px;
  color: ${s("textSecondary")};
  font-size: 14px;
  line-height: 1.5;

  li + li {
    margin-top: 4px;
  }
`;

const TokenPanel = styled.section`
  display: grid;
  gap: 12px;
  padding: 16px 20px;
  border: 1px solid ${s("accent")};
  border-radius: 8px;

  p {
    margin: 0;
  }
`;

const TokenRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  > :first-child {
    flex: 1 1 240px;
    min-width: 0;
  }
`;

const TokenInput = styled(Input)`
  input {
    font-family: ${s("fontFamilyMono")};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
