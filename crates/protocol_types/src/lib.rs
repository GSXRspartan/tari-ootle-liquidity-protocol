use pool_math::{PoolMathError, DEFAULT_FEE, FEE_DENOMINATOR};
use serde::{Deserialize, Serialize};

/// Pool identifier derived deterministically from pair and fee tier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PoolId {
    pub pair_ordered: String,
    pub fee_tier: u32,
}

impl PoolId {
    pub fn new(resource_a: &str, resource_b: &str, fee_tier: u32) -> Self {
        // Canonical ordering: sort lexicographically by resource address string
        let (a, b) = if resource_a < resource_b {
            (resource_a, resource_b)
        } else {
            (resource_b, resource_a)
        };
        Self {
            pair_ordered: format!("{}:{}", a, b),
            fee_tier,
        }
    }

    pub fn resource_pair(&self) -> (String, String) {
        let parts: Vec<&str> = self.pair_ordered.split(':').collect();
        (parts[0].to_string(), parts[1].to_string())
    }
}

/// Resource address representation (simplified for protocol layer).
/// Actual on-chain resource address is a hex string or structured address.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ResourceAddress(pub String);

impl ResourceAddress {
    pub fn new(addr: &str) -> Self {
        Self(addr.to_string())
    }
}

/// Fee tier in basis points out of 10_000.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeeTier {
    pub basis_points: u32,
}

impl FeeTier {
    pub fn default_fee() -> Self {
        Self {
            basis_points: DEFAULT_FEE,
        }
    }

    pub fn is_valid(&self) -> bool {
        self.basis_points < FEE_DENOMINATOR && self.basis_points > 0
    }
}

/// Route capability status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteStatus {
    Tested,
    Experimental,
    DesignOnly,
    Blocked,
    Disabled,
}

/// Route description for the capability matrix.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDescriptor {
    pub from: String,
    pub to: String,
    pub status: RouteStatus,
    pub notes: String,
    pub fee_tier_available: Option<u32>,
}

/// Pool metadata (read-only, non-authoritative from indexer).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolInfo {
    pub pool_id: PoolId,
    pub resource_a: ResourceAddress,
    pub resource_b: ResourceAddress,
    pub fee_tier: FeeTier,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub lp_total_supply: Option<u64>,
    pub timestamp_created_approx: Option<u64>,
    pub route_status: RouteStatus,
}

/// Transaction preview result for adapter display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionPreview {
    pub from_account: String,
    pub to_component: String,
    pub resources_involved: Vec<String>,
    pub amounts: Vec<u64>,
    pub fee_tier: u32,
    pub estimated_output: Option<u64>,
    pub max_epoch: u64,
    pub privacy_disclosure: String,
}

/// Capability matrix for the protocol.
/// Source of truth: this file and docs/ROUTE_MATRIX.md.
pub fn initial_route_matrix() -> Vec<RouteDescriptor> {
    vec![
        RouteDescriptor {
            from: "PublicFungible".to_string(),
            to: "TariNative".to_string(),
            status: RouteStatus::Experimental,
            notes: "Requires native Tari resource validation; TariSwap template supports fungible pairs including Tari resource.".to_string(),
            fee_tier_available: Some(DEFAULT_FEE),
        },
        RouteDescriptor {
            from: "PublicFungible".to_string(),
            to: "PublicFungible".to_string(),
            status: RouteStatus::Experimental,
            notes: "Standard AMM route; tested with integer math; requires pool deployment and indexer integration.".to_string(),
            fee_tier_available: Some(DEFAULT_FEE),
        },
        RouteDescriptor {
            from: "StealthAsset".to_string(),
            to: "TariNative".to_string(),
            status: RouteStatus::Blocked,
            notes: "Stealth resource enters public pool; amounts revealed at boundary; upstream TariSwap allows stealth/fungible but AMM privacy leakage must be explicitly disclosed.".to_string(),
            fee_tier_available: Some(DEFAULT_FEE),
        },
        RouteDescriptor {
            from: "StealthAsset".to_string(),
            to: "PublicFungible".to_string(),
            status: RouteStatus::Blocked,
            notes: "Similar privacy leakage as stealth/Tari route; requires feature gate and user disclosure.".to_string(),
            fee_tier_available: Some(DEFAULT_FEE),
        },
        RouteDescriptor {
            from: "WrappedStablecoin".to_string(),
            to: "TariNative".to_string(),
            status: RouteStatus::Blocked,
            notes: "Requires upstream stable-coin template; admin controls must not be included in permissionless AMM.".to_string(),
            fee_tier_available: Some(DEFAULT_FEE),
        },
        RouteDescriptor {
            from: "PrivateStablecoin".to_string(),
            to: "PublicFungible".to_string(),
            status: RouteStatus::Blocked,
            notes: "Direct private AMM not safe today; use wrapped public version first.".to_string(),
            fee_tier_available: Some(DEFAULT_FEE),
        },
        RouteDescriptor {
            from: "NFTCollection".to_string(),
            to: "TariNative".to_string(),
            status: RouteStatus::Blocked,
            notes: "NFT liquidity requires separate non-fungible design; no upstream NFT pool template exists.".to_string(),
            fee_tier_available: None,
        },
    ]
}
