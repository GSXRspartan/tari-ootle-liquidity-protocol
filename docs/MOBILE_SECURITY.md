# MOBILE SECURITY

## Requirements
- Device-local encrypted seed (never transmitted to cloud or server).
- Android Keystore-backed encryption when available.
- Biometric unlock optional (fingerprint/face) with fallback to device PIN.
- No plaintext seed in logs, crash reports, or backups.
- Custom KeyValueStore adapter for secure storage (replacing browser localStorage).

## Storage abstraction
The SDK requires a `KeyValueStore` adapter. For mobile:
- Implement adapter using native secure storage plugin (Capacitor Native Storage / Keystore).
- Encrypt data with a key derived from device authentication + user password if set.
- Never store raw seed in `SharedPreferences` or `localStorage`.

## Platform recommendations
- Use Capacitor for cross-platform build.
- Android: use `AndroidKeystore` or equivalent native plugin for key storage.
- iOS: use `Keychain` for encrypted storage.
- Biometric unlock: use `@capacitor-community/biometrics` or native equivalent.

## Security checks
- Verify adapter uses encrypted storage before connecting wallet.
- Confirm seed is not present in application bundle or build artifacts.
- Verify no analytics or tracking libraries have access to transaction data.
- Confirm mobile app does not transmit private keys to any backend API.
