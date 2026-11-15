import * as Tabs from "@radix-ui/react-tabs";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { CustomEmoji } from "@shared/components/CustomEmoji";
import Icon from "@shared/components/Icon";
import { s } from "@shared/styles";
import type { PropertyOption } from "@shared/types/documentProperties";
import { iconNames } from "@shared/utils/IconNames";
import { IconLibrary } from "@shared/utils/IconLibrary";
import Button from "~/components/Button";
import InputSearch from "~/components/InputSearch";
import { Tab, TabsGroup } from "~/components/Tabs";
import Text from "~/components/Text";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "~/components/primitives/Drawer";
import useMobile from "~/hooks/useMobile";
import useStores from "~/hooks/useStores";

type OptionIcon = NonNullable<PropertyOption["icon"]>;

interface Props {
  /** The label of the option, used to name the controls. */
  optionLabel: string;
  /** The current icon, if any. */
  icon: OptionIcon | undefined;
  /** The option color, used to preview builtin icons. */
  color: string | undefined;
  /** Called with the chosen icon, or undefined to remove it. */
  onChange: (icon: OptionIcon | undefined) => void;
}

/**
 * Chooses the icon of a single-select option: an icon from Outline's catalog
 * or a custom emoji from the workspace. Standard emoji are not offered
 * because the server stores only these two kinds.
 *
 * @param props the picker props.
 * @returns the picker trigger and its popover.
 */
export const PropertyOptionIconPicker = observer(
  function PropertyOptionIconPicker({
    optionLabel,
    icon,
    color,
    onChange,
  }: Props) {
    const { t } = useTranslation();
    const { emojis } = useStores();
    const isMobile = useMobile();
    const [open, setOpen] = React.useState(false);
    const [tab, setTab] = React.useState<OptionIcon["kind"]>(
      icon?.kind ?? "builtin"
    );
    const [query, setQuery] = React.useState("");
    const name = optionLabel.trim() || t("this option");

    React.useEffect(() => {
      if (open) {
        void emojis.fetchAllIfNeeded();
      }
    }, [open, emojis]);

    const handleOpenChange = React.useCallback(
      (next: boolean) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setTab(icon?.kind ?? "builtin");
        }
      },
      [icon]
    );

    const handleSelect = React.useCallback(
      (next: OptionIcon) => {
        onChange(next);
        handleOpenChange(false);
      },
      [onChange, handleOpenChange]
    );

    const handleRemove = React.useCallback(() => {
      onChange(undefined);
      handleOpenChange(false);
    }, [onChange, handleOpenChange]);

    const handleTabChange = React.useCallback((value: string) => {
      setTab(value === "emoji" ? "emoji" : "builtin");
      setQuery("");
    }, []);

    const handleQuery = React.useCallback(
      (ev: React.ChangeEvent<HTMLInputElement>) => setQuery(ev.target.value),
      []
    );

    const builtinItems = React.useMemo(() => {
      const allowed = new Set<string>(iconNames);
      return IconLibrary.findIcons(query.trim())
        .filter((value) => allowed.has(value))
        .map((value) => ({ value, label: iconLabel(value) }));
    }, [query]);

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const emojiItems = emojis.orderedData
      .filter((emoji) =>
        emoji.name.toLocaleLowerCase().includes(normalizedQuery)
      )
      .map((emoji) => ({ value: emoji.id, label: emoji.name }));

    const currentLabel = icon
      ? icon.kind === "builtin"
        ? iconLabel(icon.value)
        : (emojis.get(icon.value)?.name ?? t("Custom emoji"))
      : undefined;

    const trigger = (
      <Button
        type="button"
        neutral
        aria-label={
          currentLabel
            ? t("Icon for {{ name }}: {{ icon }}. Change icon", {
                name,
                icon: currentLabel,
              })
            : t("Add an icon to {{ name }}", { name })
        }
        icon={icon ? <IconGlyph icon={icon} color={color} /> : undefined}
      >
        {icon ? t("Icon") : t("Add icon")}
      </Button>
    );

    const content = (
      <Tabs.Root value={tab} onValueChange={handleTabChange}>
        <Header>
          <TabsGroup>
            <TabList aria-label={t("Icon source")}>
              <Tabs.Trigger value="builtin" asChild>
                <Tab active={tab === "builtin"}>{t("Icons")}</Tab>
              </Tabs.Trigger>
              <Tabs.Trigger value="emoji" asChild>
                <Tab active={tab === "emoji"}>{t("Workspace emojis")}</Tab>
              </Tabs.Trigger>
            </TabList>
          </TabsGroup>
          {icon && (
            <Button type="button" neutral onClick={handleRemove}>
              {t("Remove icon")}
            </Button>
          )}
        </Header>
        <Search>
          <InputSearch
            value={query}
            onChange={handleQuery}
            placeholder={
              tab === "builtin"
                ? `${t("Search icons")}…`
                : `${t("Search emoji")}…`
            }
            autoFocus
          />
        </Search>
        <Tabs.Content value="builtin">
          <IconGrid
            label={t("Icons")}
            items={builtinItems}
            selected={icon?.kind === "builtin" ? icon.value : undefined}
            empty={t("No icons match your search.")}
            renderItem={(value) => (
              <IconGlyph icon={{ kind: "builtin", value }} color={color} />
            )}
            onSelect={(value) => handleSelect({ kind: "builtin", value })}
          />
        </Tabs.Content>
        <Tabs.Content value="emoji">
          <IconGrid
            label={t("Workspace emojis")}
            items={emojiItems}
            selected={icon?.kind === "emoji" ? icon.value : undefined}
            empty={
              emojis.orderedData.length
                ? t("No custom emojis match your search.")
                : t(
                    "This workspace has no custom emojis yet. Add them in Settings under Emojis."
                  )
            }
            renderItem={(value) => (
              <IconGlyph icon={{ kind: "emoji", value }} color={color} />
            )}
            onSelect={(value) => handleSelect({ kind: "emoji", value })}
          />
        </Tabs.Content>
      </Tabs.Root>
    );

    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent
            aria-label={t("Choose an icon for {{ name }}", { name })}
          >
            {content}
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <Popover open={open} onOpenChange={handleOpenChange} modal>
        <PopoverTrigger>{trigger}</PopoverTrigger>
        <PopoverContent
          aria-label={t("Choose an icon for {{ name }}", { name })}
          width={GRID_COLUMNS * CELL_SIZE + 32}
          side="bottom"
          align="start"
          scrollable={false}
          shrink
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }
);

interface IconGlyphProps {
  icon: OptionIcon;
  color: string | undefined;
}

function IconGlyph({ icon, color }: IconGlyphProps) {
  if (icon.kind === "emoji") {
    return <CustomEmoji value={icon.value} size={20} />;
  }
  return <Icon value={icon.value} color={color} size={20} initial="" />;
}

interface GridItem {
  value: string;
  label: string;
}

interface IconGridProps {
  label: string;
  items: GridItem[];
  selected: string | undefined;
  empty: string;
  renderItem: (value: string) => React.ReactNode;
  onSelect: (value: string) => void;
}

/** A grid of named icon buttons with one tab stop and arrow key movement. */
function IconGrid({
  label,
  items,
  selected,
  empty,
  renderItem,
  onSelect,
}: IconGridProps) {
  const [activeValue, setActiveValue] = React.useState<string>();
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((item) => item.value === selected);
  const activeIndex = items.findIndex((item) => item.value === activeValue);
  const tabIndex = activeIndex >= 0 ? activeIndex : Math.max(0, selectedIndex);

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: GRID_COLUMNS,
      ArrowUp: -GRID_COLUMNS,
    };
    let next: number | undefined =
      moves[ev.key] !== undefined ? tabIndex + moves[ev.key] : undefined;
    if (ev.key === "Home") {
      next = 0;
    }
    if (ev.key === "End") {
      next = items.length - 1;
    }
    if (next === undefined || next < 0 || next >= items.length) {
      return;
    }
    ev.preventDefault();
    setActiveValue(items[next].value);
    buttons.current[next]?.focus();
  };

  if (!items.length) {
    return (
      <EmptyText as="p" size="small" type="secondary">
        {empty}
      </EmptyText>
    );
  }

  return (
    <Grid role="group" aria-label={label}>
      {items.map((item, index) => (
        <Cell
          key={item.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.value === selected}
          tabIndex={index === tabIndex ? 0 : -1}
          onKeyDown={handleKeyDown}
          onFocus={() => setActiveValue(item.value)}
          onClick={() => onSelect(item.value)}
        >
          {renderItem(item.value)}
        </Cell>
      ))}
    </Grid>
  );
}

const GRID_COLUMNS = 8;
const CELL_SIZE = 40;

/**
 * Turns a catalog icon name such as "academicCap" into "Academic cap".
 *
 * @param value the icon name.
 * @returns a readable label.
 */
const iconLabel = (value: string) => {
  const words = value.replace(/([a-z\d])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid ${s("inputBorder")};
`;

const TabList = styled(Tabs.List)`
  display: flex;
  gap: 24px;
`;

const Search = styled.div`
  padding: 8px 12px 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(${GRID_COLUMNS}, ${CELL_SIZE}px);
  justify-content: center;
  max-height: 280px;
  overflow-y: auto;
  padding: 8px 12px 12px;
`;

const Cell = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${CELL_SIZE}px;
  height: ${CELL_SIZE}px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: var(--pointer);

  &:hover,
  &[aria-pressed="true"] {
    background: ${s("listItemHoverBackground")};
  }
`;

const EmptyText = styled(Text)`
  margin: 0;
  padding: 16px 12px 20px;
`;
