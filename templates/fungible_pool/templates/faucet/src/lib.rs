use tari_template_abi::rust::collections::Vec;
use tari_template_lib::prelude::*;

#[template]
mod faucet {
    use super::*;

    pub fn take_free_coins(&mut self) -> Bucket {
        // For test purposes only: returns a small amount of native Tari
        let amount = Amount::from(1_000_000u64); // 1 TARI in micro-tari
        ResourceManager::get(STEALTH_TARI_RESOURCE_ADDRESS).mint_fungible(amount)
    }
}
