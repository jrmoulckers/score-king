# Hearts Card Passing

Status: Accepted

## Context

Hearts setup exposed a reminder toggle and card count. Its old cycle visited
seat offsets 1 through N-1 then held (four players: Left, Across, Right, Hold).
The user requested fixed clockwise by default, counterclockwise, and conventional
four-player Left, Right, Across, Hold, generalized to supported 3-11-seat tables.

## Decision

New configurations store `passMode`: `clockwise`, `counterclockwise`, or `rotating`.
Fixed modes pass left/clockwise or right/counterclockwise every hand, without a hold.
Rotating alternates nearest left/right recipients, then farther pairs, visits the
opposite player once at even-sized tables, and holds after all other recipients.
Odd-sized tables have no opposite seat. Deck count affects scoring and player limits,
not passing order. Directions refer to physical seating, never scoreboard sorting.

Group mode and card count under a shared, semantic Card Passing fieldset. New modes
always show their direction in round entry, including when an older configuration
still carries `passing:false`. Passing remains informational and never changes scores.

Round entry uses an unboxed, decorative direction glyph beside readable instructions,
not a navigation-style badge. Rotating and visible legacy reminders show
`Passing cycle C · Deal D of N (includes Hold)`: one cycle visits every other seat
then holds, so the hold deal is position N and the next deal starts cycle C+1.
Progress is derived from the configured mode's actual sequence and reopened round
index, independent of deck count. Fixed directions have no all-around cycle and omit
this metadata; no reminder repeats the shared editor's round number as a hand label.

Missing `passMode` retains the old cycle. The old `passing:false` flag only proves
that reminders were hidden, not that the group did not pass. Preserve that visibility
without inventing a No passing rule. Do not rewrite games, rounds, presets, or backups.

When applying a legacy Rules Preset or Game Preset, use a field-level saved-default
resolver before retired keys are discarded. It materializes `legacy` or `legacy-hidden`
in the draft, not in the stored preset. A conditional saved-setup option explains
the retained behavior; choosing one of the three new modes explicitly opts in.
Saving or updating the preset is still a separate user action. Player Groups remain
configuration-neutral. Fresh forms and preset deselection use the new clockwise default.

## Consequences

No database, backup envelope, or relay migration is needed. Live clients receive the
existing game configuration and derive the same mode. Reopening a saved hand retains
its hand-index-based original reminder. History scoring and descriptions are unchanged.
Old clients cannot interpret new modes; compatibility is old-data reading by the new
app, not support for editing new-mode games in old clients.

The legacy reminder-hidden exception is deliberate. It is not offered to fresh games
and is not silently converted into a passing rule.
