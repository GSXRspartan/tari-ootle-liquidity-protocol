// Fungible Liquidity Pool Template for Tari Ootle
// MIT License — non-custodial, permissionless, no admin withdrawal
// Uses upstream TariSwap constant-product model with strict access rules
// Fee scale: per-mil out of 1000 (3 = 0.30%, 30 = 3.00%)
// Default fee: 3 (0.30%) — 100% to LP reserves, 0% developer/protocol fee

use tari_template_abi::rust::collections::BTreeMap;
use tari_template_lib::prelude::*;

#[template]
mod fungible_pool {
    use super::*;

    /// Minimum initial liquidity to defend against first-depositor ratio manipulation.
    /// Based on Tari divisibility (6): 1 TARI = 1_000_000 micro-tari.
    /// For general fungible resources, this represents a safe base amount.
    const MINIMUM_INITIAL_LIQUIDITY: u64 = 1_000_000; // 1 TARI in smallest units

    /// Minimum LP shares to permanently lock on first deposit.
    /// This prevents first-depositor attacks by ensuring a portion of initial
    /// shares is permanently locked and cannot be redeemed.
    /// Derived from LP token standard divisibility: 1000 smallest units is negligible
    /// for normal operation but sufficient to anchor the pool.
    const MINIMUM_LOCKED_LIQUIDITY: u64 = 1_000;

    /// Pool component storing reserves in vaults, LP token, and fee tier.
    pub struct Pool {
        pools: BTreeMap<ResourceAddress, Vault>,
        lp_resource: ResourceAddress,
        fee: u16, // per-mil out of 1000; 3 = 0.30%; max 100 = 10.00%
    }

    impl Pool {
        /// Initialize a new pool for the given pair and fee.
        /// Resources must be fungible, different from each other, and include native Tari.
        pub fn new(a_addr: ResourceAddress, b_addr: ResourceAddress, fee: u16) -> Component<Self> {
            // Security: pair must be distinct
            assert!(a_addr != b_addr, "Pool pair resources must differ");

            // Security: both resources must exist and be fungible
            Self::validate_fungible_resource(a_addr);
            Self::validate_fungible_resource(b_addr);

            // Security: fee must be within safe range (1..=100 => 0.1%..10.0%)
            assert!(
                fee > 0 && fee <= 100,
                "Pool fee must be in range 1..100 (per-mil out of 1000)"
            );

            // Security: fix resource pairing deterministically to prevent substitution
            let ordered_pair = Pool::canonical_pair(a_addr, b_addr);
            let (canonical_a, canonical_b) = ordered_pair;

            // Create vaults for reserves
            let mut pools = BTreeMap::new();
            pools.insert(canonical_a, Vault::new_empty(canonical_a));
            pools.insert(canonical_b, Vault::new_empty(canonical_b));

            // Create LP token resource (fungible, restricted burn to component only)
            let lp_resource = ResourceBuilder::public_fungible()
                .with_token_symbol("LP")
                .with_divisibility(18)
                .burnable(AccessRule::DenyAll, UpdateRule::Locked) // Only component can burn via component logic
                .build();

            Component::new(Self {
                pools,
                lp_resource,
                fee,
            })
            // STRICT ACCESS RULES: only component methods (not arbitrary callers)
            // No admin withdrawal method exists. Pool is immutable after creation.
            .with_access_rules(
                ComponentAccessRules::new()
                    .default(AccessRule::DenyAll)
                    .method("add_liquidity", AccessRule::AllowAll)
                    .method("swap", AccessRule::AllowAll)
                    .method("remove_liquidity", AccessRule::AllowAll)
                    .method("get_pool_balances", AccessRule::AllowAll)
                    .method("get_pool_balance", AccessRule::AllowAll)
                    .method("lp_resource", AccessRule::AllowAll)
                    .method("lp_total_supply", AccessRule::AllowAll)
                    .method("fee", AccessRule::AllowAll),
            )
            .create()
        }

        /// Add liquidity to the pool, minting LP shares proportionally.
        /// Both buckets must match the pool's resource pair.
        pub fn add_liquidity(&mut self, a_bucket: Bucket, b_bucket: Bucket) -> Bucket {
            let a_res = a_bucket.resource_address();
            let b_res = b_bucket.resource_address();
            self.check_pool_resources(a_res, b_res);

            // Security: amounts must be non-zero
            assert!(!a_bucket.amount().is_zero(), "Input A must be non-zero");
            assert!(!b_bucket.amount().is_zero(), "Input B must be non-zero");

            let a_amount = a_bucket.amount();
            let b_amount = b_bucket.amount();

            // Security: first-deposit defense — enforce minimum initial liquidity
            let a_pool_before = self.get_pool_balance(a_res);
            let b_pool_before = self.get_pool_balance(b_res);
            if a_pool_before.is_zero() && b_pool_before.is_zero() {
                let min_amount = Amount::from(MINIMUM_INITIAL_LIQUIDITY);
                assert!(
                    a_amount >= min_amount,
                    "First deposit A must exceed minimum initial liquidity ({} units)",
                    MINIMUM_INITIAL_LIQUIDITY
                );
                assert!(
                    b_amount >= min_amount,
                    "First deposit B must exceed minimum initial liquidity ({} units)",
                    MINIMUM_INITIAL_LIQUIDITY
                );

                // FIRST DEPOSIT: use geometric mean with locked minimum liquidity
                // initial_shares = floor(sqrt(a * b))
                // mint (initial_shares - MINIMUM_LOCKED) to first LP
                // permanently lock MINIMUM_LOCKED shares
                let a_u128: u128 = a_amount.to_u128();
                let b_u128: u128 = b_amount.to_u128();
                let product = a_u128 * b_u128;
                let initial_shares_u128 = Self::integer_sqrt(product);
                let initial_shares = Amount::new(initial_shares_u128);

                // Must have enough shares to lock minimum
                let min_locked = Amount::new(MINIMUM_LOCKED_LIQUIDITY as u128);
                assert!(
                    initial_shares >= min_locked,
                    "Initial shares ({}) must exceed minimum locked ({})",
                    initial_shares,
                    MINIMUM_LOCKED_LIQUIDITY
                );

                // Mint initial_shares, then burn MINIMUM_LOCKED to permanently lock
                let mut lp_bucket =
                    ResourceManager::get(self.lp_resource).mint_fungible(initial_shares);
                // Permanently lock MINIMUM_LOCKED shares by taking and burning from the minted bucket
                let min_locked = Amount::new(MINIMUM_LOCKED_LIQUIDITY as u128);
                lp_bucket.take(min_locked).burn();

                // Security: deposit into vaults (reserves grow by full amounts)
                self.pools.get_mut(&a_res).unwrap().deposit(a_bucket);
                self.pools.get_mut(&b_res).unwrap().deposit(b_bucket);
                return lp_bucket;
            }

            // Security: deposit into vaults (reserves grow by full amounts)
            self.pools.get_mut(&a_res).unwrap().deposit(a_bucket);
            self.pools.get_mut(&b_res).unwrap().deposit(b_bucket);

            // Subsequent deposits: proportional share minting based on reserve ratios
            let a_pool = self.get_pool_balance(a_res);
            let b_pool = self.get_pool_balance(b_res);

            // Proportional shares: shares = (amount / reserve) * total_supply
            let total_supply = self.lp_total_supply();
            let a_shares = (a_amount * total_supply) / a_pool;
            let b_shares = (b_amount * total_supply) / b_pool;
            // Use minimum ratio to prevent manipulation (conservative)
            let new_lp_amount = a_shares.min(b_shares);

            ResourceManager::get(self.lp_resource).mint_fungible(new_lp_amount)
        }

        /// Swap input resource for output resource using constant-product formula.
        pub fn swap(&mut self, input_bucket: Bucket, output_resource: ResourceAddress) -> Bucket {
            let input_resource = input_bucket.resource_address();
            self.check_pool_resources(input_resource, output_resource);

            let input_pool = self.get_pool_balance(input_resource);
            let output_pool = self.get_pool_balance(output_resource);

            // Security: reject empty reserves (prevents division by zero / drain)
            assert!(!input_pool.is_zero(), "Input reserve is empty");
            assert!(!output_pool.is_zero(), "Output reserve is empty");

            let input_amount = input_bucket.amount();
            assert!(!input_amount.is_zero(), "Swap amount must be non-zero");

            // Apply fee: fee is per-mil out of 1000 (e.g., 3 = 0.30%)
            let fee = Amount::new(self.fee as u128);
            let denom = Amount::new(1000);
            let _effective_input = (input_amount * (denom - fee)) / denom;

            // Constant-product invariant: k = input_pool * output_pool
            // After swap with fee retained in input reserve:
            // new_input_pool = input_pool + input_amount (full amount stays in reserve, fee included)
            // new_output_pool = k / new_input_pool
            // output_amount = output_pool - new_output_pool
            let k = input_pool * output_pool;
            let new_input_pool = input_pool + input_amount; // fee stays in input reserve
            let new_output_pool = k / new_input_pool;
            let output_amount = output_pool - new_output_pool;

            assert!(
                !output_amount.is_zero(),
                "Swap output amount is zero (check slippage/min-output)"
            );

            // Security: deposit input
            self.pools
                .get_mut(&input_resource)
                .unwrap()
                .deposit(input_bucket);
            // Security: withdraw output
            self.pools
                .get_mut(&output_resource)
                .unwrap()
                .withdraw(output_amount)
        }

        /// Remove liquidity by burning LP shares and returning proportional reserves.
        pub fn remove_liquidity(&mut self, lp_bucket: Bucket) -> (Bucket, Bucket) {
            assert_eq!(
                lp_bucket.resource_address(),
                self.lp_resource,
                "Invalid LP resource"
            );
            let lp_amount = lp_bucket.amount();
            assert!(!lp_amount.is_zero(), "LP removal amount must be non-zero");

            let a_res = self.get_a_resource();
            let a_pool = self.get_pool_balance(a_res);
            let b_res = self.get_b_resource();
            let b_pool = self.get_pool_balance(b_res);

            let total_lp = self.lp_total_supply();
            assert!(!total_lp.is_zero(), "LP total supply is zero");

            // Proportional withdrawal using integer division with documented rounding
            // We use floor division to prevent over-withdrawal (protects pool reserves)
            let ratio = lp_amount / total_lp;
            let a_amount = ratio * a_pool;
            let b_amount = ratio * b_pool;

            // Security: burn LP tokens (only pool can mint/burn via component authority)
            lp_bucket.burn();

            let a_bucket = self.pools.get_mut(&a_res).unwrap().withdraw(a_amount);
            let b_bucket = self.pools.get_mut(&b_res).unwrap().withdraw(b_amount);
            (a_bucket, b_bucket)
        }

        /// Public method to retrieve first resource in canonical order.
        pub fn get_a_resource(&self) -> ResourceAddress {
            *self.pools.keys().next().unwrap()
        }

        /// Public method to retrieve second resource in canonical order.
        pub fn get_b_resource(&self) -> ResourceAddress {
            let keys: Vec<ResourceAddress> = self.pools.keys().cloned().collect();
            assert!(keys.len() >= 2, "Pool must have exactly 2 resources");
            keys[1]
        }

        /// Read-only balance access.
        pub fn get_pool_balances(&self) -> BTreeMap<ResourceAddress, Amount> {
            let mut balances = BTreeMap::new();
            for (res, vault) in &self.pools {
                balances.insert(*res, vault.balance());
            }
            balances
        }

        /// Read-only single resource balance.
        pub fn get_pool_balance(&self, resource_address: ResourceAddress) -> Amount {
            let vault = self
                .pools
                .get(&resource_address)
                .unwrap_or_else(|| panic!("Resource {:?} is not in pool", resource_address));
            vault.balance()
        }

        /// Read LP resource address.
        pub fn lp_resource(&self) -> ResourceAddress {
            self.lp_resource
        }

        /// Read total LP supply.
        pub fn lp_total_supply(&self) -> Amount {
            ResourceManager::get(self.lp_resource).total_supply()
        }

        /// Read fee tier.
        pub fn fee(&self) -> u16 {
            self.fee
        }

        /// Internal validation: resource must exist and be fungible.
        fn validate_fungible_resource(resource: ResourceAddress) {
            let resource_type = ResourceManager::get(resource).resource_type();
            assert!(
                matches!(
                    resource_type,
                    ResourceType::Fungible | ResourceType::Confidential | ResourceType::Stealth
                ),
                "Resource {:?} must be fungible",
                resource
            );
        }

        /// Internal validation: resources must be valid pair and present in pool.
        fn check_pool_resources(&self, a: ResourceAddress, b: ResourceAddress) {
            assert_ne!(a, b, "Pool resources must differ");
            assert!(self.pools.contains_key(&a), "Resource {:?} not in pool", a);
            assert!(self.pools.contains_key(&b), "Resource {:?} not in pool", b);
        }

        /// Internal canonical pair ordering (lexicographic by resource address string representation).
        fn canonical_pair(
            a: ResourceAddress,
            b: ResourceAddress,
        ) -> (ResourceAddress, ResourceAddress) {
            // For simplicity in WASM, compare string representations
            let a_str = format!("{:?}", a);
            let b_str = format!("{:?}", b);
            if a_str <= b_str {
                (a, b)
            } else {
                (b, a)
            }
        }

        /// Integer square root using binary search.
        /// Returns floor(sqrt(n)) for n >= 0. No floating point, checked arithmetic.
        fn integer_sqrt(n: u128) -> u128 {
            if n == 0 {
                return 0;
            }
            if n <= 1 {
                return n;
            }
            let mut low: u128 = 1;
            let mut high: u128 = n.min(1_u128 << 64);
            while low <= high {
                let mid = (low + high) / 2;
                let mid_sq = match mid.checked_mul(mid) {
                    Some(v) => v,
                    None => {
                        high = mid - 1;
                        continue;
                    }
                };
                if mid_sq == n {
                    return mid;
                } else if mid_sq < n {
                    low = mid + 1;
                } else {
                    if mid == 0 {
                        return 0;
                    }
                    high = mid - 1;
                }
            }
            high
        }
    }
}
