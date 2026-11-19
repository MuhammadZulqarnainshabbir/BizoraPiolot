import { useWindowDimensions } from 'react-native';
import { space } from '@/theme';

/** Content stops growing past this on tablets and in landscape, so lines and forms stay readable. */
export const MAX_CONTENT_WIDTH = 760;
/** Space between tiles in a metric grid. */
export const GRID_GAP = 12;

/**
 * Screen-size classes for layouts that adapt: `compact` for small phones (tighter padding),
 * `wide` for large phones in landscape and tablets (more columns, capped content width).
 * Re-renders on rotation and split view.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const compact = width < 360;
  const wide = width >= 600;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
  const padding = compact ? space.md : space.lg;
  const columns = width >= 900 ? 4 : wide ? 3 : 2;
  return {
    width,
    height,
    compact,
    wide,
    landscape: width > height,
    /** Width of the page content (the window, capped). */
    contentWidth,
    /** Horizontal page padding for this size. */
    padding,
    /** Content width inside the page padding. */
    innerWidth: contentWidth - padding * 2,
    /** Tiles per row in a metric grid. */
    columns
  };
}
