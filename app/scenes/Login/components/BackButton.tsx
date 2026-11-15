import { BackIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Desktop from "~/utils/Desktop";

type Props = {
  /** Returns to the previous step of sign-in; nothing renders without it. */
  onBack?: () => void;
};

/**
 * Link back to the previous step of signing in to this Outline instance.
 * There's no other instance or marketing site to return to.
 */
export function BackButton({ onBack }: Props) {
  const { t } = useTranslation();

  if (!onBack) {
    return null;
  }

  return (
    <Link onClick={onBack}>
      <BackIcon /> {t("Back")}
    </Link>
  );
}

const Link = styled.a`
  display: flex;
  align-items: center;
  color: inherit;
  padding: ${Desktop.isElectron() ? "48px 32px" : "32px"};
  font-weight: 500;
  position: absolute;

  svg {
    transition: transform 100ms ease-in-out;
  }

  &:hover {
    svg {
      transform: translateX(-4px);
    }
  }
`;
