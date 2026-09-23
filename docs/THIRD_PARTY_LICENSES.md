# THIRD PARTY LICENSES

## @chironbuilder/ootle-sdk (version 0.1.11)
- Source: https://github.com/chironbuilds/ootle-sdk-ts
- License: MIT
- Notice preserved: See upstream LICENSE file
- Why included: Wallet adapter interface and SDK wrapper use its public API surface; no source copied
- Copying policy: Not copied; dependency referenced in package.json only

## tari-ootle (BSD-3-Clause)
- Source: https://github.com/tari-project/tari-ootle
- License: BSD-3-Clause (see upstream LICENSE)
- Notice preserved: Not copied; only reference paths and formula descriptions recorded in docs
- Why referenced: TariSwap template logic analyzed; no code copied into this repository except concept descriptions in docs

## tari-cli (BSD-3-Clause)
- Source: https://github.com/tari-project/tari-cli
- License: BSD-3-Clause
- Notice preserved: Not copied; only referenced for CLI/tooling conventions

## stable-coin (BSD-3-Clause)
- Source: https://github.com/tari-project/stable-coin
- License: BSD-3-Clause
- Notice preserved: Not copied; only referenced for design patterns to avoid (admin keys, pause)

## Sapient Wallet / tari-wallet (PolyForm Noncommercial)
- Source: https://github.com/chironbuilds/tari-wallet (referenced by SDK docs)
- License: PolyForm Noncommercial
- Notice preserved: Not copied into this repository
- Why mentioned: SDK documentation notes the extraction source; our adapter interface is independent
- Critical restriction: DO NOT copy source code from Sapient wallet application. Only implement adapter interface that interacts with it externally (e.g., via browser extension message passing) without violating license.

## MIT dependencies (npm)
- Standard MIT-licensed packages used in TypeScript packages are tracked in package-lock.json / pnpm-lock.yaml
- No proprietary dependencies required for protocol operation
