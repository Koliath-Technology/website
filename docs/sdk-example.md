# SDK example

The mobile app must not contain the Koliath app secret. It collects an installation id and the verification token from the store referrer, then asks your backend to confirm the install.

```text
Koliath website  --start-->  verification token on the store referrer
Android/iOS app  --token + installation_id-->  your backend
your backend     --app secret-->  POST /api/v1/installations/verify
```

Samples:

- [examples/sdk/verify-server.ts](../examples/sdk/verify-server.ts) — your server calls Koliath
- [examples/sdk/AndroidInstallReporter.kt](../examples/sdk/AndroidInstallReporter.kt) — the app calls your server

Generate `installation_id` once (`UUID.randomUUID()` or `UUID().uuidString`) and keep it in app-private storage or Keychain. Optionally keep a second `device_key` the same way. Do not read IMEI, MAC, or the advertising id.

On Android, read `koliath_verification_token` and `koliath_app_id` from the Play Install Referrer. On iOS, read the same query items from the universal link you control. Then `POST` them to your backend over HTTPS. Your backend adds `Authorization: Bearer` with the secret from its environment.

A `granted` response is the only time points move, and they move on Koliath's server. Treat `already_granted` as success with no new points. Do not retry a `granted` or `already_granted` token. Refreshing the token requires the user to start a new signed-in download, which still will not pay twice.

Play Integrity (`attestation.play_integrity_token`) and App Attest (`attestation.app_attest_assertion`) can be forwarded later. v1 records that no verifier is configured and does not require them.
