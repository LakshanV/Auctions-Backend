# SINGHA — Dependency / Supply-Chain Review

_Part of the maximum-intensity validation programme (static / dependency / supply-chain lens)._
_Backend `pnpm audit --prod`, this run._

## Result

`pnpm audit --prod` went from **10 advisories (4 high, 5 moderate, 1 low)** to **1 moderate** after
safe, same-major version overrides. All are transitive **DoS-class** advisories (no RCE / data
exposure), and the runtime blast radius is already bounded by the route-aware rate limiter and the
signed-URL + MIME-allowlist media pipeline.

## Fixed — `pnpm.overrides` (safe within-major bumps; static gate + media/data-core/security e2e green)

| Package | Was | Now | Advisories closed |
|---|---|---|---|
| `multer` | 2.0.2 | `>=2.2.0` | 3 × HIGH (DoS: incomplete/uncontrolled/deeply-nested multipart) |
| `qs` | 6.14.2 | `>=6.15.2` | 1 × moderate (DoS: `qs.stringify`) |
| `body-parser` | 1.20.4 | `>=1.20.6` | 1 × low (DoS on malformed body) |
| `file-type` | 20.4.1 | `>=21.3.2` | 2 × moderate (ASF infinite loop; ZIP decompression-bomb DoS) — verified the media MIME pipeline still works at runtime |

## Remaining — 1 moderate, requires a MAJOR framework upgrade (owner / maintainer decision)

| Package | Installed | Patched in | Advisory | Why not auto-applied |
|---|---|---|---|---|
| `@nestjs/core` | 10.4.22 | `>=11.1.18` | moderate — improper neutralization of special elements | Patched only in the **v11 major**. A NestJS 10 → 11 upgrade is a framework-wide breaking change that needs its own tested migration cycle; forcing it during a validation pass would risk regressions across every module. Recommend a scheduled, separately-verified upgrade. Mitigated meanwhile by server-side validation + rate limiting. |

## Notes

- Overrides are declared in the root `package.json` `pnpm.overrides` and pinned in
  `pnpm-lock.yaml`; they apply to the whole workspace.
- Re-run `pnpm audit --prod` after any dependency change to keep this current.
