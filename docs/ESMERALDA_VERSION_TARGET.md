# ESMERALDA VERSION TARGET

Date: 2026-09-23

## Current Ootle State (from C:\tmp-tari checkout)

**Workspace version**: 0.41.1 (from Cargo.toml)
**Git HEAD**: `2d6083e6cc7c98cde93dacebe2fb76b17703f588` (development branch, 46 commits ahead of v0.41.1 tag)
**Tag status**: No tags found in local checkout (shallow clone)

## Version Details (from C:\tmp-tari Cargo.toml)

| Component | Version | Source |
|-----------|---------|--------|
| tari-ootle workspace | 0.41.1 | Cargo.toml |
| template_lib | 0.32 | workspace |
| template_test_tooling | 0.41 | workspace |
| tari_engine | 0.41 | workspace |
| engine_types | 0.41 | workspace |
| transaction | 0.41 | workspace |
| template_abi | 0.20 | workspace |
| template_macros | 0.23 | workspace |
| template_metadata | 0.12 | workspace |
| tari_bor | 0.16.1 | workspace |
| tari_consensus_types | 0.41 | workspace |
| tari_ootle_common_types | 0.41 | workspace |
| tari_engine_types | 0.41 | workspace |
| tari_template_builtin | 0.41 | workspace |

## Version Selection for This Project

**Selected**: Use git dependencies pinned to development HEAD `2d6083e6cc7c98cde93dacebe2fb76b17703f588`

Reasoning:
- No v0.41.1 tag exists in the local checkout (shallow clone)
- The workspace version is 0.41.1 but the git history only shows the latest development commit
- Using development HEAD ensures compatibility with the actual codebase we're building against
- Template compiles and builds successfully with these dependencies

## Dependency Configuration for This Project

```toml
# Pinned to development HEAD (2d6083e6cc7c98cde93dacebe2fb76b17703f588)
tari_template_abi = { git = "https://github.com/tari-project/tari-ootle.git", rev = "2d6083e6cc7c98cde93dacebe2fb76b17703f588" }
tari_template_lib = { git = "https://github.com/tari-project/tari-ootle.git", rev = "2d6083e6cc7c98cde93dacebe2fb76b17703f588" }
tari_template_test_tooling = { git = "https://github.com/tari-project/tari-ootle.git", rev = "2d6083e6cc7c98cde93dacebe2fb76b17703f588" }
tari_engine = { git = "https://github.com/tari-project/tari-ootle.git", rev = "2d6083e6cc7c98cde93dacebe2fb76b17703f588" }
```

## Why This Matters for Our Template

- Template compiles against development HEAD APIs (verified working)
- Engine test harness uses `tari_template_test_tooling` 0.41
- Transaction format compatible with 0.41 workspace
- WASM module cache API compatible

## Note on Esmeralda Deployment

The actual Esmeralda testnet version should be verified before deployment. This document records the versions we built and tested against locally. For production deployment, pin to the exact Esmeralda validator version.