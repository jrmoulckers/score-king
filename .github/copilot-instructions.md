# Copilot instructions

## Design Context

This project has committed design context. **Read these before changing any UI:**

- **[PRODUCT.md](../PRODUCT.md)** — strategy: register (`product`), users, purpose,
  brand personality (*Whimsical, Easy, Game-Night Energy*), anti-references, design
  principles, and the accessibility/inclusion brief.
- **[DESIGN.md](../DESIGN.md)** — the visual system: color tokens, typography, elevation,
  components, and forceful Do's & Don'ts. Creative North Star: **"The Game-Night LARPer"**
  (consistent chrome underneath, thematic per-game costume on top).
- **`.impeccable/design.json`** — machine-readable sidecar (tonal ramps, shadows, motion,
  live component snippets) consumed by the impeccable design skill.

Non-negotiables pulled from DESIGN.md:

- **Royal Violet** (`#7c5cff`) marks exactly one primary action per screen; **Crown Gold**
  (`#ffd166`) is reserved for the leader and the winner — never buttons or decoration.
- Build depth by climbing the surface ramp (`surface` → `surface-2` → `surface-3`), not by
  stacking shadows. One Soft Lift shadow only. Glass (backdrop blur) only on the top app
  bar and bottom tab bar.
- Render every changing number with `tabular-nums`; keep touch targets ≥46px (one-handed,
  dim-light use); never signal state with color alone; honor `prefers-reduced-motion`.
- Keep the chrome identical game to game — express per-game personality through emoji,
  copy, and accent moments, not by restyling the shell.

To evolve the design system, use the **impeccable** skill (e.g. `/impeccable critique`,
`/impeccable craft`, `/impeccable live`). Re-run `/impeccable document` if the visual
system drifts so DESIGN.md and the sidecar stay accurate.
