# Universal link / app link files for the mobile app

Served by nginx at `https://<domain>/.well-known/...` so the employee login link and the password reset link open the Bizora Pilot mobile app when it is installed (guide section 8.4).

- `apple-app-site-association`: replace `TEAMID` with the Apple Developer team id of the iOS build. Served as `application/json` without a file extension.
- `assetlinks.json`: replace the fingerprint with the SHA-256 of the Android release signing key (`eas credentials` shows it).

Both files must be reachable over HTTPS with no redirect, and `EXPO_PUBLIC_LINK_DOMAIN` must be set to the same domain when the mobile app is built.
