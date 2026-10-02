// Icons come from the lucide-preact package (ISC License, shipped with the
// package). This module only fixes the shared names and the wk-icon classes
// that script styles target.
import { render } from 'preact';
import { Check, Loader, RefreshCw, Settings, TriangleAlert, X } from 'lucide-preact';

const ICONS = {
  x: X,
  'refresh-cw': RefreshCw,
  settings: Settings,
  check: Check,
  'alert-triangle': TriangleAlert,
  loader: Loader,
};

const ICON_NAMES = Object.keys(ICONS);

function Icon({ name, size = 16, strokeWidth = 2 }) {
  const Glyph = ICONS[name];
  if (!Glyph) {
    throw new Error(`shared-icons: unknown icon "${name}". Available: ${ICON_NAMES.join(', ')}`);
  }
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      class={`wk-icon wk-icon-${name}`}
      aria-hidden="true"
      focusable="false"
    />
  );
}

// For markup still built as strings: render the icon into an existing slot.
function mountIcon(slot, name, options = {}) {
  if (slot) render(<Icon name={name} {...options} />, slot);
  return slot;
}

export { ICON_NAMES, Icon, mountIcon };
