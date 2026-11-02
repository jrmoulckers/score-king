# Saved setup kinds

Status: Accepted

## Context

Saved presets combined players and rules for a single game. Players need to reuse ordered
groups across games and apply rules without changing the selected players.

## Decision

Extend the existing portable `gamePresets` records with an optional `kind`: `group`, `rules`,
or `full`. Missing kinds always mean full setups, even for an empty lineup. Do not migrate
or infer old records. Groups keep the source `type` for record-shape compatibility but are
available across games and survive deletion of the source custom game. Rules and full
setups remain scoped to that game.

Use the existing saved-setup store and crew nickname/signature helpers, not a second
group entity. History crews remain derived, unordered history groupings; saved groups
retain their own explicit seating order.

Groups own only players; rules own only config; full setups own both. Applying or updating
never changes the unowned part. Current game defaults fill newly added config fields,
and retired fields are ignored, as before. Available players are never capped on apply.
The form names any limit mismatch and blocks Start until the user adjusts it.

Per the user-directed lazy cleanup policy, viewing/selecting a saved group removes
archived, tombstoned, or missing members from that saved group. Player removal does not
eagerly clean groups. Empty groups stay available for rename/delete or later replacement.
Cleanup waits for a successful, complete roster read; in-flight reads are invalidated and
cleanup is held across backup replacement and subsequent roster refresh. A failed read
leaves cleanup disabled and reports the existing storage error.

Legacy full setups keep existing roster behavior: unavailable players are skipped visibly
on apply without erasing archived membership. Permanent deletion still prunes their ids.

## Consequences

No IndexedDB or backup envelope migration is required. All kinds ride the existing
portable settings list and inherit its whole-list restore and merge semantics. Older
backups lacking the setting leave the current list unchanged. A group pruned after an
authoritative restore does not regain a member automatically when they are later restored;
the user can select that member and explicitly update the group.

Older app versions do not understand new save kinds; this is backward-compatible reading
of old data by the new app, not support for editing new Groups or Rules in old clients.
