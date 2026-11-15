import { ChevronDown } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { HEADER_HEIGHT } from "@shared/constants";
import { motionTokens } from "~/components/arc/motion-tokens";

interface Props {
  /** The rows, as a list whose items are the rows, or a message. */
  children: React.ReactNode;
  /**
   * Shown at the start of the footer, such as the button that adds rows.
   * Without it, the rows may fill the whole section before they overflow.
   */
  footer?: React.ReactNode;
  /** Changes when a row is added, which opens the rows so it is reachable. */
  expandSignal: number;
}

/** A row's place within the rows, in pixels from their top. */
export interface RowPlacement {
  top: number;
  height: number;
  /** Whether the row holds keyboard focus. */
  focused: boolean;
  /** Whether the row has a list or calendar open. */
  open: boolean;
}

/**
 * Which rows the collapsed section hides: every row after the first that
 * ends below the collapsed height. The section opens instead, hiding none,
 * when a row has a list or calendar open, which the clip would cut, or when
 * focus is below the fold: in a row it would hide, or low in a first row
 * taller than the fold.
 *
 * @param rows the rows, in order.
 * @param clamp the collapsed height of the rows, in pixels.
 * @param focusBottom where the focused element ends, in pixels from the top
 *   of the rows, while they hold focus.
 * @returns whether each row is hidden, and whether the section must open.
 */
export function rowReach(
  rows: RowPlacement[],
  clamp: number,
  focusBottom?: number
) {
  const hidden = rows.map(
    (row, index) => index > 0 && row.top + row.height > clamp + 1
  );
  const expand =
    (focusBottom !== undefined && focusBottom > clamp + 1) ||
    rows.some((row, index) => row.open || (row.focused && hidden[index]));
  return { hidden: expand ? rows.map(() => false) : hidden, expand };
}

const { considered, standard, instant } = motionTokens.duration;
/** Opening is a considered reveal and closing a quicker standard move, each growing by up to an instant with the distance travelled. */
const openDuration = (distance: number) =>
  considered + Math.min(distance / 1600, instant);
const closeDuration = (distance: number) =>
  standard + Math.min(distance / 2000, instant);
const unit = (value: number) => Math.min(Math.max(value, 0), 1);
const openSelector = '[aria-expanded="true"]';

/**
 * Holds the properties at the section's collapsed height, with a soft fade
 * and a Show more toggle when, and only when, they overflow it. Rows below
 * the fold leave the tab order until the section opens, and it opens at once
 * when a row is added, opens a list, or takes focus below the fold. Only the
 * toggle animates the change, and the rows fold again whenever they fit. A
 * footer is only shown when it holds something, so read-only rows can use
 * the whole section before they overflow.
 *
 * @param props the component props.
 * @returns the rows and the section's footer.
 */
export function CollapsibleRows({ children, footer, expandSignal }: Props) {
  const { t } = useTranslation();
  const rowsId = useId();
  const reduced = useReducedMotion() ?? false;
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [animating, setAnimating] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const limitProbe = useRef<HTMLSpanElement>(null);
  const clampRef = useRef(0);
  const overflowRef = useRef(false);
  const expandedRef = useRef(false);
  const animateNext = useRef(false);
  const lastSignal = useRef(expandSignal);
  const range = useRef({ from: 0, to: 0 });
  const running = useRef<AnimationPlaybackControls | null>(null);
  const open = expanded && overflowing;
  const lastOpen = useRef(open);
  const hasFooter = Boolean(footer);
  const showFooter = hasFooter || overflowing;
  /** 0 is collapsed, 1 is fully open. Height, the fade, and the chevron all follow it. */
  const progress = useMotionValue(0);
  const height = useMotionValue<number | "auto">("auto");
  const rotate = useTransform(progress, [0, 1], [0, 180]);
  const fade = useTransform(progress, (value) =>
    Math.pow(1 - unit(value), 1.35)
  );

  // The ref is read by the observers below, between renders.
  const setIntent = useCallback((next: boolean) => {
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  // Rows are marked inert directly, React never renders the attribute, so
  // the rows can be checked whenever their size, content, or focus changes.
  const syncReach = useCallback(() => {
    const node = box.current;
    const innerNode = inner.current;
    if (!node || !innerNode) {
      return;
    }
    const rows = Array.from(
      innerNode.querySelectorAll<HTMLElement>(":scope > ul > li")
    );
    const active = document.activeElement;
    const { hidden, expand } =
      overflowRef.current && !expandedRef.current
        ? rowReach(
            rows.map((row) => ({
              top: row.offsetTop,
              height: row.offsetHeight,
              focused: row.contains(active),
              open: row.querySelector(openSelector) !== null,
            })),
            clampRef.current,
            active && innerNode.contains(active)
              ? active.getBoundingClientRect().bottom -
                  node.getBoundingClientRect().top
              : undefined
          )
        : { hidden: [], expand: false };
    if (expand) {
      setIntent(true);
    }
    rows.forEach((row, index) =>
      row.toggleAttribute("inert", Boolean(hidden[index]))
    );
  }, [setIntent]);

  // Runs before the rows are checked below, so a row just added is never
  // made inert.
  useLayoutEffect(() => {
    if (lastSignal.current !== expandSignal) {
      lastSignal.current = expandSignal;
      setIntent(true);
    }
  }, [expandSignal, setIntent]);

  // The probes are exactly the collapsed height of the rows beside a footer,
  // and the whole section's, so the footer's size on coarse pointers never
  // needs to be computed by hand. Rows overflow past the section's height
  // when there is no footer; once they do, the toggle needs one. Rows that
  // fit drop the intent to open, so a later overflow folds again.
  useLayoutEffect(() => {
    const probeNode = probe.current;
    const limitNode = limitProbe.current;
    const innerNode = inner.current;
    if (!probeNode || !limitNode || !innerNode) {
      return;
    }
    const measure = () => {
      clampRef.current = probeNode.getBoundingClientRect().height;
      const limit = hasFooter
        ? clampRef.current
        : limitNode.getBoundingClientRect().height;
      overflowRef.current =
        innerNode.getBoundingClientRect().height > limit + 1;
      setOverflowing(overflowRef.current);
      if (!overflowRef.current && expandedRef.current) {
        setIntent(false);
      }
      syncReach();
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(probeNode);
    observer.observe(limitNode);
    observer.observe(innerNode);
    return () => observer.disconnect();
  }, [hasFooter, setIntent, syncReach]);

  useEffect(() => {
    const innerNode = inner.current;
    if (!innerNode) {
      return;
    }
    const observer = new MutationObserver(syncReach);
    observer.observe(innerNode, {
      subtree: true,
      childList: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, [syncReach]);

  useEffect(
    () =>
      progress.on("change", (value) => {
        if (running.current) {
          const { from, to } = range.current;
          height.set(from + (to - from) * value);
        }
      }),
    [progress, height]
  );

  // Only the toggle animates; rows that open the section to be edited, and
  // reduced motion, change at once.
  useLayoutEffect(() => {
    if (lastOpen.current === open) {
      return;
    }
    lastOpen.current = open;
    const animated = animateNext.current && !reduced;
    animateNext.current = false;
    const pinned = height.get();
    running.current?.stop();
    running.current = null;
    const node = box.current;
    const innerNode = inner.current;
    if (!animated || !node || !innerNode) {
      progress.jump(open ? 1 : 0);
      height.set("auto");
      if (node) {
        node.style.height = "auto";
      }
      setAnimating(false);
      return;
    }
    const full = innerNode.getBoundingClientRect().height;
    const clamp = Math.min(clampRef.current, full);
    // At rest the height is auto, so a move starts from the side it leaves;
    // a move reversed midway starts from where it is.
    const current = typeof pinned === "number" ? pinned : open ? clamp : full;
    range.current = { from: clamp, to: full };
    const span = Math.max(full - clamp, 1);
    progress.jump(unit((current - clamp) / span));
    // Pins the height before the clamp lifts, so nothing jumps for a frame;
    // motion only writes it on the next one.
    node.style.height = `${current}px`;
    height.set(current);
    setAnimating(true);
    const target = open ? 1 : 0;
    const distance = Math.abs(target - progress.get()) * span;
    running.current = animate(progress, target, {
      duration: open ? openDuration(distance) : closeDuration(distance),
      ease: motionTokens.ease.enter,
      onComplete: () => {
        running.current = null;
        height.set("auto");
        setAnimating(false);
      },
    });
  }, [open, reduced, progress, height]);

  useLayoutEffect(() => {
    syncReach();
  });

  useEffect(() => () => running.current?.stop(), []);

  const toggle = () => {
    const next = !open;
    const node = box.current;
    // Closing from far down the page would leave the reader below the
    // section; its start comes back into view as it closes.
    if (!next && node && node.getBoundingClientRect().top < HEADER_HEIGHT) {
      node.scrollIntoView({
        block: "start",
        behavior: reduced ? "auto" : "smooth",
      });
    }
    animateNext.current = true;
    setIntent(next);
  };

  const clamped = overflowing && !open && !animating;

  return (
    <>
      <Rows
        ref={box}
        id={rowsId}
        data-footer={showFooter ? "" : undefined}
        data-clamped={clamped ? "" : undefined}
        data-clip={clamped || animating ? "" : undefined}
        style={{ height }}
        onFocus={syncReach}
      >
        <Probe ref={probe} aria-hidden="true" />
        <Probe ref={limitProbe} aria-hidden="true" data-limit="" />
        <div ref={inner}>{children}</div>
        {overflowing && (!open || animating) && (
          <Fade aria-hidden="true" style={{ opacity: fade }} />
        )}
      </Rows>
      {showFooter && (
        <Footer>
          {footer}
          {overflowing && (
            <Toggle
              type="button"
              aria-expanded={open}
              aria-controls={rowsId}
              onClick={toggle}
            >
              {/* Both labels share one grid cell, so the button keeps the
                wider width and the chevron never moves as they crossfade. */}
              <Labels>
                <Label
                  data-active={!open || undefined}
                  aria-hidden={open || undefined}
                >
                  {t("Show more")}
                </Label>
                <Label
                  data-active={open || undefined}
                  aria-hidden={!open || undefined}
                >
                  {t("Show less")}
                </Label>
              </Labels>
              <Chevron aria-hidden="true" style={{ rotate }}>
                <ChevronDown size={16} strokeWidth={1.75} />
              </Chevron>
            </Toggle>
          )}
        </Footer>
      )}
    </>
  );
}

// At rest the clamp is plain CSS, so it follows every width and font change.
// Only the block axis clips, so value surfaces and focus rings that reach
// past the column's start stay whole.
const Rows = styled(motion.div)`
  position: relative;
  min-width: 0;
  min-height: var(--properties-height);
  scroll-margin-top: ${HEADER_HEIGHT + 8}px;

  &[data-footer] {
    min-height: var(--properties-rows);
  }

  &[data-clamped] {
    max-height: var(--properties-rows);
  }

  &[data-clip] {
    overflow-x: visible;
    overflow-y: clip;
  }
`;

const Probe = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: var(--properties-rows);
  visibility: hidden;
  pointer-events: none;

  &[data-limit] {
    height: var(--properties-height);
  }
`;

// Rows rise through the soft edge as the section opens, rather than being
// uncovered by a hard line. It spans past the column like the surfaces do.
const Fade = styled(motion.div)`
  position: absolute;
  z-index: 2;
  inset-inline: -16px;
  bottom: 0;
  height: 1.5rem;
  background: linear-gradient(to bottom, transparent, var(--background));
  pointer-events: none;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--properties-footer);
  min-width: 0;

  && > * {
    align-self: center;
  }
`;

const Toggle = styled.button`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  min-height: 32px;
  margin-inline-start: auto;
  padding: 0 4px 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: var(--pointer);
  -webkit-tap-highlight-color: transparent;
  transition:
    color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--text-secondary);
    }
  }

  &:active {
    color: var(--text-muted);
  }

  @media (prefers-reduced-motion: no-preference) {
    &:active {
      transform: scale(0.97);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
`;

const Labels = styled.span`
  display: inline-grid;
  justify-items: end;
`;

// The labels crossfade with a short vertical drift and a brief blur, timed
// to the opening.
const Label = styled.span`
  grid-area: 1 / 1;
  opacity: 0;
  filter: blur(2px);
  transform: translateY(-4px);
  transition:
    opacity var(--duration-standard) var(--ease-standard),
    transform var(--duration-considered) var(--ease-standard),
    filter var(--duration-standard) var(--ease-standard);
  pointer-events: none;

  &[data-active] {
    opacity: 1;
    filter: blur(0);
    transform: none;
  }

  & + &:not([data-active]) {
    transform: translateY(4px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Chevron = styled(motion.span)`
  display: inline-flex;
  color: var(--text-muted);
`;
