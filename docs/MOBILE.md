# Mobile apps (Android and iOS)

The apps are the same React build wrapped with Capacitor (`frontend/capacitor.config.ts`,
app ID `app.officialiq.study`). Native projects live in `frontend/android` and
`frontend/ios`. Nothing here needs a Mac: iOS builds run on GitHub's macOS runners.

| Workflow | When | What |
|---|---|---|
| `mobile-ci.yml` | Every PR and `main` push that touches `frontend/` | Android debug APK and iOS simulator build. No secrets. |
| `mobile-release.yml` | Manual (Actions → Mobile release → Run workflow) | Signed `.aab` to Play internal testing; signed build to TestFlight. Each platform skips with a notice until its secrets exist. |

Both stores' production releases are promoted by hand in Play Console and App Store Connect.

## Sign-in inside the app

Internet Identity's normal web flow opens a pop-up and answers over `postMessage`,
which an app's web view can't do. The app uses II's redirect transport (ICRC-167) instead
(`frontend/src/lib/nativeAuth.ts`):

1. The app makes a session key on the device (a non-extractable WebCrypto key) and opens
   `id.ai/authorize` outside the web view, with a request for a delegation to that key.
   On iOS 17.4+ that's an `ASWebAuthenticationSession` sheet (the in-repo plugin in
   `frontend/plugins/native-auth`); on Android and older iOS it's the system browser
   (Custom Tabs / Safari).
2. After the user approves, II navigates to `https://<web origin>/native-callback#…`.
   That is a verified link (iOS associated domain, Android App Link), so the OS hands it
   to the app and no other app can claim it. ICRC-167 forbids custom URL schemes for
   exactly that reason.
3. The app checks the response belongs to the sign-in it started, then mints app
   delegations from the II session with the SDK's own `SessionMinter` / `SessionIdentity`,
   the same machinery `AuthClient` uses on the web.

The web origin is the website's own origin, so **a user has the same principal in the app
and on the website**. It defaults to the production frontend canister's `icp0.io` address;
set the `NATIVE_WEB_ORIGIN` variable if the site moves to a custom domain (and note that
moving origins changes every user's principal on the web too).

For II and the phone to trust the callback, the frontend canister serves three files that
the build generates (`frontend/build-config/wellKnown.ts`):

| File | Needs |
|---|---|
| `/.well-known/ii-auth-callbacks` | Nothing: always built when the origin is known |
| `/.well-known/apple-app-site-association` | `APPLE_TEAM_ID` variable |
| `/.well-known/assetlinks.json` | `ANDROID_CERT_SHA256` variable |

They are built during the frontend deploy, so **after setting or changing those
variables, redeploy production** (Actions → Deploy (production)) before testing sign-in.

## What Mete needs to set up

Everything goes in GitHub → Settings → Secrets and variables → Actions. "Variable" means
the **Variables** tab (these values end up in public files, so they aren't secrets);
"secret" means the **Secrets** tab. Repository-level is fine for all of them.

### Before anything: production deployed

The apps are built against production's canister IDs, so the first production deploy
(`docs/DEPLOYMENT.md`) has to have run and committed `.icp/data/mappings/ic.ids.json`.
Until then `mobile-release.yml` stops at "Check production is deployed".

### iOS (Apple Developer Program, $99/yr)

1. Enrol at developer.apple.com. Your **Team ID** is under Membership details.
   → variable `APPLE_TEAM_ID`
2. In App Store Connect → Apps → **+** → New App: platform iOS, bundle ID
   `app.officialiq.study` (register it under Certificates, Identifiers & Profiles →
   Identifiers first if it isn't offered, with the **Associated Domains** capability
   ticked), any SKU.
3. App Store Connect → Users and Access → Integrations → App Store Connect API →
   Team Keys → **+**, role **Admin** (Xcode's cloud signing needs it to create the
   distribution certificate). Download the `.p8` (only possible once).
   - Key ID → secret `APP_STORE_CONNECT_KEY_ID`
   - Issuer ID (top of that page) → secret `APP_STORE_CONNECT_ISSUER_ID`
   - The whole `.p8` file's text, including the BEGIN/END lines → secret `APP_STORE_CONNECT_KEY_P8`
4. Redeploy production so `apple-app-site-association` is published, then run
   Mobile release with platform `ios`. The build shows up in TestFlight after Apple
   processes it. Add yourself as an internal tester there.

No certificates or provisioning profiles are stored anywhere: Xcode's automatic signing
makes and renews them through the API key.

### Android (Google Play Console, $25 once)

1. Create a developer account at play.google.com/console, then **Create app**
   (name OfficialIQ, app, free). Package name is set by the first upload:
   `app.officialiq.study`.
2. Make an upload key. This is the one step that runs on your computer (WSL is fine),
   because the key should exist only with you and in the secrets:
   ```bash
   keytool -genkeypair -v -keystore upload.keystore -alias upload \
     -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 upload.keystore   # copy the output
   ```
   - base64 output → secret `ANDROID_KEYSTORE_BASE64`
   - the store password → secret `ANDROID_KEYSTORE_PASSWORD`
   - `upload` → secret `ANDROID_KEY_ALIAS`
   - the key password (same as the store password unless you set another) → secret `ANDROID_KEY_PASSWORD`
   Keep `upload.keystore` and its password in your password manager too. If it's lost,
   Play support can reset the upload key, but it takes days.
3. Run Mobile release with platform `android`. Without `PLAY_SERVICE_ACCOUNT_JSON` it
   stops after building and attaches the signed `.aab` to the run. **Upload that first
   bundle by hand** (Play Console → Test and release → Testing → Internal testing → Create
   release): Play only accepts API uploads once an app has had one. Accept Play App Signing
   when asked.
4. Play Console → Test and release → App integrity → App signing: copy the **SHA-256** of
   both the app signing key and the upload key.
   → variable `ANDROID_CERT_SHA256`, comma-separated. Redeploy production so
   `assetlinks.json` is published.
5. For automatic uploads: Google Cloud console → create a service account in any project,
   enable the Google Play Android Developer API there, create a JSON key. In Play Console →
   Users and permissions → Invite new users, invite the service account's email with
   **Release to testing tracks** for this app.
   → secret `PLAY_SERVICE_ACCOUNT_JSON` (the whole JSON file)
6. Run Mobile release with `play_release_status: draft` until the app's first release has
   been reviewed, then `completed`.

### Summary

| Name | Kind | From |
|---|---|---|
| `APPLE_TEAM_ID` | variable | Apple Developer → Membership |
| `APP_STORE_CONNECT_KEY_ID` | secret | App Store Connect API key |
| `APP_STORE_CONNECT_ISSUER_ID` | secret | App Store Connect API page |
| `APP_STORE_CONNECT_KEY_P8` | secret | the downloaded `.p8` |
| `ANDROID_KEYSTORE_BASE64` | secret | `base64 -w0 upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | secret | chosen in `keytool` |
| `ANDROID_KEY_ALIAS` | secret | `upload` |
| `ANDROID_KEY_PASSWORD` | secret | chosen in `keytool` |
| `PLAY_SERVICE_ACCOUNT_JSON` | secret | Google Cloud service account key |
| `ANDROID_CERT_SHA256` | variable | Play Console → App integrity (both keys) |
| `NATIVE_WEB_ORIGIN` | variable, optional | Only for a custom domain |
| `GOOGLE_SERVICES_JSON` | secret | Firebase → Android app → `google-services.json` |
| `FCM_SERVICE_ACCOUNT_JSON` | secret, `production` env | Firebase → Service accounts → new private key |
| `APNS_KEY_P8` | secret, `production` env | Apple Developer → Keys → APNs key `.p8` |
| `APNS_KEY_ID` | secret, `production` env | that key's ID |
| `FEATURE_NATIVE_PUSH` | variable | `true` once the four above are set |

### Push notifications

Streak milestones (7, 30 and 100 days) reach the apps through Apple's and
Google's push services. The app registers its device token with the user
canister; the push relay (`push-relay.yml`, every 15 minutes) sends to
APNs and FCM directly (`frontend/scripts/lib/nativePush.mjs`). Until the
credentials exist, the relay skips phones and keeps their notifications
queued, and the app hides the notification switch.

1. **Firebase (Android).** Create a Firebase project, add an Android app
   with package `app.officialiq.study`, download `google-services.json`
   → secret `GOOGLE_SERVICES_JSON` (the whole file). The release workflow
   writes it into the Android project before building.
2. **Firebase service account (relay).** Project settings → Service
   accounts → Generate new private key → secret
   `FCM_SERVICE_ACCOUNT_JSON` on the `production` environment.
3. **APNs key (iOS).** Apple Developer → Certificates, Identifiers &
   Profiles → Keys → create a key with Apple Push Notifications service
   enabled, download the `.p8` once → secret `APNS_KEY_P8` (the file's
   contents) and `APNS_KEY_ID` on the `production` environment. The relay
   uses the `APPLE_TEAM_ID` variable as the team. The app's entitlement is
   already in `ios/App/App/App.entitlements`; automatic signing adds the
   capability to the app ID.
4. Set the repository variable `FEATURE_NATIVE_PUSH` to `true` and run
   Mobile release. Leave it unset until steps 1 to 3 are done: turning push
   on in an Android build without Firebase config crashes the app.
5. On a test phone, turn on notifications on the Me tab, then check the
   next push relay run's log lists the device's platform as "on".

## Testing sign-in on a phone

Once production is deployed and the variables above are set and redeployed:

- iOS: install from TestFlight, tap Sign in. The II sheet opens; after approving it closes
  and you're signed in. On iOS below 17.4 Safari opens instead and hands back to the app.
- Android: install from the internal testing link, tap Sign in. Chrome Custom Tabs opens;
  after approving the app comes back to the front, signed in.

If the app doesn't come back, open `https://<origin>/.well-known/assetlinks.json` (or
`apple-app-site-association`) and check it lists the right fingerprints / team ID. Android
re-verifies App Links when the app is installed, so reinstall after fixing the file.
