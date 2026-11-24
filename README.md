# Glass Finance for Android

A private, offline personal finance app for Android with a Liquid Glass–inspired interface and **automatic tracking of UPI payments you send and receive**. Built for INR (₹). All data stays on your phone.

| | |
|---|---|
| Package | `com.samiulla.glassfinance` |
| Platform | Android 7.0+ (API 24), targets Android 16 (API 36), tested setup for Android 15 |
| Stack | Capacitor 8 · Kotlin · Room · vanilla JS UI · GitHub Actions |

---

## Install on your phone (no PC needed)

1. On your Android phone, open **https://github.com/mullasamiullawork-rgb/glass-finance-android/releases**.
2. Open the **"Glass Finance (latest debug build)"** pre-release and tap **`GlassFinance-debug.apk`** to download it.
3. Open the downloaded file. If Android asks, allow **"Install unknown apps"** for your browser (Chrome → Allow from this source), then tap **Install**.
4. Open Glass Finance → **More → Automatic Tracking → Allow notification access**.
   - On Android 13+ you may see **"Restricted setting"** for apps installed from a file. Fix: *Settings → Apps → Glass Finance → ⋮ (top-right) → Allow restricted settings*, then grant notification access again.
   - On Xiaomi/POCO (HyperOS/MIUI): also set *Settings → Apps → Glass Finance → Battery saver → **No restrictions*** and enable **Autostart**, so Android doesn't stop the tracker in the background.

Alternative: every build is also attached as a zipped artifact on the **Actions** tab (sign-in required, download → unzip → install).

> Updating: install the newer APK over the old one. Your data is kept. Debug builds are signed with one stable key kept in the Actions cache; if that cache ever expires (7 days with no builds), Android will refuse the update — back up first (Settings → Encrypted backup), uninstall, install, restore. Adding a `DEBUG_KEYSTORE_BASE64` secret makes the key permanent.

---

## What it does

**Ledger & planning** — Home dashboard, transactions (search, filter, sort, swipe actions), Quick Add with keypad, quick amounts and recent merchants, multiple accounts (cash, bank, savings, wallet/UPI, credit card) with transfers that never count as income or expense, monthly and category budgets with warnings, analytics (week → year, custom), goals, savings tracker, bills with reminders, recurring transactions (daily/weekly/monthly/yearly/custom, idempotent auto-posting), insights, an offline assistant that answers from your data only, global search, PIN lock, encrypted backups, CSV/JSON export & import, PDF summary, light/dark/system themes.

**Automatic tracking** (Android app):

| Source | Status | How |
|---|---|---|
| A. UPI app notifications — Paytm, Google Pay, PhonePe, BHIM, Amazon Pay, CRED, MobiKwik, super.money, FamApp, Navi | ✅ Implemented, unit-tested with fixtures | `NotificationListenerService`; per-app parsers in a configurable registry |
| B. Bank SMS alerts (SBI, HDFC, ICICI, Axis, Kotak, BoB, Canara, Union, PNB, IPPB, Indian Bank, Paytm/Airtel Payments Bank…) | ✅ Implemented, unit-tested | Read from the **notification** of your SMS app (Google Messages, Xiaomi/POCO Messages, Samsung, Truecaller, OnePlus). **No `READ_SMS` permission.** OTPs, promotions and personal messages are discarded unread |
| C. Bank transaction history | ✅ CSV statement import (tested) · ❌ Account Aggregator not connected | AA needs an RBI-regulated FIU partner (e.g. Setu, Finarkein, or a bank FIU), a business entity, contract and API keys. Interface is ready (`GF.providers`) |
| D. Payments started from Glass Finance | ✅ Implemented | UPI deep-link intent; the app's reply is recorded as **provisional/pending**, never as bank-settled. Some UPI apps restrict intent payments |

Every detection goes through one **reconciliation engine**, so a payment seen by Paytm, then by an SBI SMS, then in a statement is **one** transaction that gets upgraded:

- `PROVISIONAL` — one payment-app notification
- `CONFIRMED` — a bank alert, or two independent sources agree
- `BANK_VERIFIED` — matched to an imported bank statement

Classification: Expense · Income (shown as *Money received*, never assumed to be earnings) · Refund · Transfer · Reversal · Unknown, with statuses Successful / Pending / Failed / Reversed. Pending, failed and unclassified records never touch balances. Merchant categories (Food, Transport, Groceries, Shopping, Health, Bills, Education, Subscriptions, Entertainment, Other) are automatic and **your corrections are remembered** per merchant.

Balances: each account shows the **calculated ledger balance**, the **actual bank balance you enter**, and the **last balance reported by a bank alert/statement** — never presented as a live bank balance.

---

## Architecture

```
web/                      UI (vanilla JS modules, no framework) — built into www/
  src/store.js            versioned schema (v2) + migrations, amounts in integer paise
  src/calc.js             pure calculations (balances, totals, budgets, ranges)
  src/native.js           Capacitor bridge: back button, haptics, share/save files, Room mirror, local notifications
  src/autotrack.js        mirrors reconciled native records into the ledger (idempotent by id)
  src/screens-*.js        Home, Transactions, Budget, Analytics, Accounts, Goals, Bills,
                          Savings, Recurring, Insights, Assistant, Search, Settings, Automatic Tracking
android/app/src/main/java/com/samiulla/glassfinance/
  MainActivity.kt         registers the AutoTrack plugin, FLAG_SECURE (no screenshots / recents preview)
  autotrack/core/         PURE Kotlin, no Android imports → fully unit-tested
    Model.kt              ParsedPayment, DetectedTx, enums (direction, kind, status, source, verification)
    Parsers.kt            UpiAppParser, BankSmsParser, PaymentAppRegistry, privacy filters (OTP/promo/requests)
    Engine.kt             Reconciler, Classifier, Categorizer
  autotrack/data/Db.kt    Room: detected_tx, detection_log (outcomes only, no text), merchant_rule, app_state
  autotrack/PaymentNotificationListener.kt   drops every non-supported package before reading anything
  autotrack/AutoTrackRepository.kt           parse → reconcile → persist on one serial background thread
  autotrack/AutoTrackPlugin.kt               JS API: status, settings, list/update, diagnostics, statement import, UPI pay
```

**Persistence:** the ledger lives in WebView storage *and* is mirrored to Room (`app_state`) after every change; on start the newer copy wins, so data survives WebView storage loss. Detected transactions live in Room and keep arriving while the UI is closed. Android cloud backup is disabled (`allowBackup=false`, data-extraction rules exclude everything) so financial data never leaves the device unless you export it.

**Privacy:** no internet calls are made by the app; notification text is parsed in memory and never stored; no Accessibility Service, no SMS permission, no contacts, no location; UPI PINs, OTPs and passwords are never requested or stored. You can turn tracking off per app, delete all automatic-tracking data, or erase everything.

**Future-ready:** provider interfaces for Account Aggregator, cloud sync, receipt OCR, investments, loans/EMI, credit score and family finance are declared but report `isAvailable() = false` — nothing fake is wired in.

---

## Development

Requirements: Node 22+, JDK 21, Android SDK (API 36) — or just push and let GitHub Actions build.

```bash
npm ci
npm test                    # web tests (jsdom): screens, self-test, transfers, persistence, assistant, search, mirroring, encryption
npm run build               # web/ → www/
npx cap sync android        # copy www/ and plugins into android/
cd android
./gradlew testDebugUnitTest # Kotlin: parsers, reconciliation, categoriser (JVM) + Room/repository (Robolectric)
./gradlew assembleDebug     # → android/app/build/outputs/apk/debug/app-debug.apk
```

Regenerate the icon and splash: `python3 scripts/make-icons.py`.

Add a payment app: append one line to `PaymentAppRegistry.apps` (and its package to `<queries>` in the manifest), add a fixture and a test in `ParserTest.kt`.

### Tests (fixtures in `android/app/src/test/.../Fixtures.kt` — invented sample texts, never real data)

| # | Case | Where |
|---|---|---|
| 1–4 | Paytm, Google Pay, PhonePe, BHIM successful payments (+ Amazon Pay) | `ParserTest` |
| 5–6 | Incoming / outgoing UPI | `ParserTest` |
| 7–10 | Refund, reversal, failed, pending | `ParserTest`, `ReconcilerTest` |
| 11 | Duplicate bank SMS + UPI notification → one transaction | `ReconcilerTest` |
| 12–14 | Missing merchant, missing reference, unsupported format | `ParserTest` |
| 15 | Notification access revoked is detected | `RepositoryTest` (Robolectric) |
| 16–17 | App restart, Room persistence | `RepositoryTest` |
| 18 | Offline / OTP never stored | `RepositoryTest` |
| 19 | Bank statement import reconciles | `RepositoryTest`, web self-test |
| 20 | Provisional → bank-verified reconciliation | `ReconcilerTest` |
| — | Same-amount payments are **not** merged; different refs never merge; idempotent replay | `ReconcilerTest` |
| — | Calculations, transfers, recurring idempotency, INR formatting, statement CSV | `tests/web`, in-app *Settings → Run self-test* |

Real-device behaviour (exact notification wording on your phone, OEM background limits) can only be verified on the device: use **Automatic Tracking → Detection diagnostics → Test a notification format**.

---

## CI/CD

- **`.github/workflows/android-build.yml`** — on push to `main`, pull requests and manual dispatch: web tests → build → `cap sync` → Kotlin unit tests → `assembleDebug` → verifies the APK → uploads it as an artifact and refreshes the **debug-latest** pre-release.
- **`.github/workflows/android-release.yml`** — on tags `v*.*.*` or manual dispatch: builds a **signed release APK** and attaches it to a GitHub Release.

### Release signing (one-time)

Create a keystore (on any computer or in Termux): `keytool -genkeypair -v -keystore release.jks -alias glassfinance -keyalg RSA -keysize 2048 -validity 10000`, then add these repository secrets (*Settings → Secrets and variables → Actions*): `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Push a tag like `v1.0.0`. Keystores and passwords are never committed (`.gitignore`).

---

## Known limitations

- Automatic tracking only sees payments whose notification (or bank SMS notification) actually appears on the phone. If an app shows no notification, or Android/HyperOS kills the listener, that payment is missed — import a bank statement to fill gaps.
- Notification wording differs by app version and bank; parsers cover common formats and will need new patterns over time (diagnostics shows what was ignored).
- Account Aggregator sync is not connected (requires a regulated FIU partner).
- Debug and release builds use different signing keys, so you can't update one with the other.
- Bill reminders are scheduled local notifications; the PIN is a local privacy lock, not encryption (Android's file-based encryption protects data at rest).
