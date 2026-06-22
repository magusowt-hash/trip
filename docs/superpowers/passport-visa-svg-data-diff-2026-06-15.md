# Passport Visa SVG/Data Diff

Date: 2026-06-15

## Summary

- `world.svg` path ids: `256`
- `passportVisaSeed` country codes: `245`
- Present in SVG but missing from data: `11`
- Present in data but missing from SVG: `0`

## SVG Only

These region codes exist in `test/public/maps/passport-visa/world.svg` but do not currently exist in `test/lib/passportVisaSeed.ts`.

```text
AF
CN
HK
MO
TW
UM-DQ
UM-FQ
UM-HQ
UM-JQ
UM-MQ
UM-WQ
```

## Data Only

None.
