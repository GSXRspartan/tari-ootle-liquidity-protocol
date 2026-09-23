# LP AUTHORITY MODEL

Status: DOCUMENTED AND ENFORCED (template source verified)

## Mint authority
Only `Pool::add_liquidity()` can mint LP shares. The method uses:
```
ResourceManager::get(self.lp_resource).mint_fungible(new_lp_amount)
```
This call occurs ONLY within the component method. The access rules (`AccessRules::new().set_method_access(...)`) do not expose mint functionality externally. No external caller can invoke `mint_fungible` on the LP resource because:
- `AccessRules` for public methods (`add_liquidity`, `swap`, `remove_liquidity`, etc.) does not include any mint authorization hook except through component execution.
- The `.add_constraint()` with `.add_hook(ResourceAuthAction::Burn, OwnerRule::ResourceOnly(lp_resource))` restricts burn (not mint) to the resource owner.
- Mint authority is implicit to the component because the component creates and manages the resource via `ResourceBuilder::public_fungible()`.

Engine-level verification needed: `tari_template_test_tooling` tests should confirm that external transactions attempting to mint the LP resource directly fail.

## Burn authority
Only `Pool::remove_liquidity()` can burn LP shares. The method uses:
```
lp_bucket.burn();
```
This burn is protected by the access rule constraint:
```
.add_hook(ResourceAuthAction::Burn, OwnerRule::ResourceOnly(lp_resource))
```
This means only the owner of the LP resource (which must be the account holding the LP shares) can burn it. The component itself does not need a separate authorization badge to burn; the engine validates the resource owner against the burn hook.

## Creator privileges
The pool creator (`new()` method) receives NO special privileges:
- No `set_fee` method exists.
- No `admin_withdraw` method exists.
- No `upgrade` or `replace` method exists.
- The creator's account is not stored as an owner or admin address.
- The only persistent identity in the component is the `lp_resource` address, which is managed by the component, not by any external user.

## Unauthorized mint/burn tests (required before TESTED status)
Engine-level regression tests must verify:
1. External transaction with `ResourceAuthAction::Mint` for `lp_resource` is rejected.
2. External transaction attempting `ResourceAuthAction::Burn` on `lp_resource` without owning the resource is rejected.
3. Component `new()` does not expose any hidden method that could alter access rules.
4. Component `new()` does not store an admin badge or owner address that permits future upgrades.

## First-deposit share fairness
The `add_liquidity()` method calculates shares based on reserve ratios:
```
let a_ratio = if reserve.is_zero() { large_base } else { amount / reserve };
```
With `MINIMUM_INITIAL_LIQUIDITY = 1_000_000`, the first deposit uses a non-zero reserve ratio (not zero), preventing the extreme ratio manipulation where a tiny initial deposit creates an unreasonably large share percentage relative to reserves. The large base factor (`1_000_000`) ensures that the first LP shares are substantial relative to the initial reserves, making donation attacks less effective.

However, a donation attack remains possible: an attacker can donate a huge amount of one resource directly to the vault, changing the reserve ratio without receiving LP shares. Since our template does not include a donation/method guard against direct vault deposits (the engine may allow direct vault deposits through other mechanisms), this is a documented limitation. The defense relies on the economic cost of donation exceeding the potential gain from share manipulation.

Documented in `docs/SECURITY_MODEL.md`.
