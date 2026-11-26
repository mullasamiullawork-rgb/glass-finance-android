package com.samiulla.glassfinance.autotrack

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.samiulla.glassfinance.autotrack.core.*
import com.samiulla.glassfinance.autotrack.data.AppStateEntity
import com.samiulla.glassfinance.autotrack.data.DetectedTxEntity
import com.samiulla.glassfinance.autotrack.data.MerchantRuleEntity
import org.json.JSONArray
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.os.Build
import android.service.notification.NotificationListenerService
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/** Bridge between the web UI and the native detection engine. */
@CapacitorPlugin(name = "AutoTrack")
class AutoTrackPlugin : Plugin() {
    private val repo by lazy { AutoTrackRepository.get(context) }
    private val dao get() = repo.db.dao()

    override fun load() {
        repo.listener = { tx, change ->
            val o = toJs(tx); o.put("change", change)
            activity?.runOnUiThread { notifyListeners("detected", o) }
        }
    }

    private fun bg(call: PluginCall, block: () -> Unit) = repo.executor.execute {
        try { block() } catch (e: Exception) { call.reject(e.message ?: e.javaClass.simpleName) }
    }

    private fun hasAccess(): Boolean = repo.hasNotificationAccess()

    private fun installed(pkg: String) = try { context.packageManager.getPackageInfo(pkg, 0); true } catch (_: PackageManager.NameNotFoundException) { false }

    @PluginMethod
    fun getStatus(call: PluginCall) = bg(call) {
        val counts = dao.outcomeCounts().associate { it.outcome to it.n }
        val all = dao.all().map { it.toCore() }.filter { !it.deleted }
        val apps = JSArray()
        PaymentAppRegistry.apps.forEach { a ->
            apps.put(JSObject().put("packageName", a.packageName).put("name", a.name).put("kind", a.kind.name)
                .put("installed", installed(a.packageName)).put("enabled", repo.isAppEnabled(a.packageName)))
        }
        val r = JSObject()
            .put("platform", "android")
            .put("notificationAccess", hasAccess())
            .put("listenerConnected", repo.prefs.getBoolean("listenerConnected", false) && hasAccess())
            .put("enabled", repo.enabled)
            .put("trackBankSms", repo.trackBankSms)
            .put("autoCategorize", repo.autoCategorize)
            .put("lastDetection", dao.lastDetection() ?: 0L)
            .put("lastBankSync", 0L)
            .put("bankSyncAvailable", false)
            .put("apps", apps)
            .put("created", counts["CREATED"] ?: 0)
            .put("updated", counts["UPDATED"] ?: 0)
            .put("duplicatesPrevented", counts["DUPLICATE"] ?: 0)
            .put("ignored", counts["IGNORED"] ?: 0)
            .put("errors", counts["ERROR"] ?: 0)
            .put("autoExpenses", all.count { it.kind == TxKind.EXPENSE && it.countsInLedger() })
            .put("autoIncome", all.count { it.kind == TxKind.INCOME && it.countsInLedger() })
            .put("refunds", all.count { (it.kind == TxKind.REFUND || it.kind == TxKind.REVERSAL) && it.countsInLedger() })
            .put("awaiting", all.count { it.status == TxStatus.PENDING || it.verification == Verification.PROVISIONAL || it.kind == TxKind.UNKNOWN })
        call.resolve(r)
    }

    @PluginMethod
    fun openNotificationAccess(call: PluginCall) {
        val i = if (android.os.Build.VERSION.SDK_INT >= 30)
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                ComponentName(context, PaymentNotificationListener::class.java).flattenToString())
        else Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(i) } catch (_: Exception) {
            context.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun setConfig(call: PluginCall) {
        call.getBoolean("enabled")?.let { repo.enabled = it }
        call.getBoolean("trackBankSms")?.let { repo.trackBankSms = it }
        call.getBoolean("autoCategorize")?.let { repo.autoCategorize = it }
        call.getArray("disabledApps")?.let { arr -> repo.disabledApps = (0 until arr.length()).map { arr.getString(it) }.toSet() }
        call.resolve()
    }

    /** Records changed after `since` (ms). The web layer mirrors them into the ledger idempotently by id. */
    @PluginMethod
    fun list(call: PluginCall) = bg(call) {
        val since = call.getLong("since") ?: 0L
        val arr = JSArray()
        dao.changedSince(since).forEach { e -> arr.put(toJs(e.toCore()).put("note", e.note)) }
        call.resolve(JSObject().put("items", arr).put("now", System.currentTimeMillis()))
    }

    /** User correction. Remembers merchant → category locally when asked. */
    @PluginMethod
    fun update(call: PluginCall) = bg(call) {
        val id = call.getString("id") ?: return@bg call.reject("id required")
        val e = dao.get(id) ?: return@bg call.reject("not found")
        var t = e.toCore()
        call.getString("kind")?.let { t = t.copy(kind = TxKind.valueOf(it)) }
        call.getString("status")?.let { t = t.copy(status = TxStatus.valueOf(it)) }
        if (call.data.has("categoryId")) t = t.copy(categoryId = call.getString("categoryId"))
        if (call.data.has("counterparty")) t = t.copy(counterparty = call.getString("counterparty"))
        call.getLong("amountPaise")?.let { t = t.copy(amountPaise = it) }
        call.getBoolean("deleted")?.let { t = t.copy(deleted = it) }
        t = t.copy(userEdited = true, updatedAt = System.currentTimeMillis())
        dao.upsert(DetectedTxEntity.from(t, if (call.data.has("note")) call.getString("note") else e.note))
        if (call.getBoolean("rememberCategory") == true && t.categoryId != null && !t.counterparty.isNullOrBlank()) {
            dao.putRule(MerchantRuleEntity(Categorizer.key(t.counterparty), t.categoryId!!, System.currentTimeMillis()))
        }
        call.resolve(toJs(t))
    }

    @PluginMethod
    fun getDiagnostics(call: PluginCall) = bg(call) {
        val arr = JSArray()
        dao.recentLog(60).forEach {
            arr.put(JSObject().put("at", it.at).put("app", PaymentAppRegistry.find(it.packageName)?.name ?: it.packageName)
                .put("outcome", it.outcome).put("reason", it.reason).put("txId", it.txId))
        }
        val p = repo.prefs
        call.resolve(JSObject().put("log", arr)
            .put("listenerConnectedAt", p.getLong("listenerConnectedAt", 0)).put("listenerDisconnectedAt", p.getLong("listenerDisconnectedAt", 0))
            .put("rules", dao.rules().size))
    }

    /** Parses sample text without saving anything: lets the user check a format from Diagnostics. */
    @PluginMethod
    fun testParse(call: PluginCall) {
        val pkg = call.getString("packageName") ?: return call.reject("packageName required")
        val text = call.getString("text") ?: return call.reject("text required")
        val app = PaymentAppRegistry.find(pkg) ?: return call.reject("Unsupported app")
        val p = app.parser.parse(RawNotification(pkg, null, text, null, null, System.currentTimeMillis()))
        if (p == null) return call.resolve(JSObject().put("parsed", false))
        call.resolve(JSObject().put("parsed", true).put("amountPaise", p.amountPaise).put("direction", p.direction.name)
            .put("status", p.status.name).put("kind", Classifier.kind(p).name).put("counterparty", p.counterparty)
            .put("upiRef", p.upiRef).put("bank", p.bankName))
    }

    /** Bank statement rows parsed by the web layer (CSV fallback for Account Aggregator). Reconciled like any other source. */
    @PluginMethod
    fun importStatement(call: PluginCall) = bg(call) {
        val rows = call.getArray("rows") ?: return@bg call.reject("rows required")
        val bank = call.getString("bankName")
        var created = 0; var updated = 0; var dup = 0
        for (i in 0 until rows.length()) {
            val r = rows.getJSONObject(i)
            val p = ParsedPayment(
                amountPaise = r.getLong("amountPaise"),
                direction = Direction.valueOf(r.getString("direction")),
                status = TxStatus.SUCCESS,
                kindHint = if (r.optString("description").contains(Regex("(?i)refund|reversal|rev\\b"))) TxKind.REFUND else null,
                counterparty = Text.cleanName(r.optString("counterparty").ifBlank { null }),
                upiRef = r.optString("ref").ifBlank { null } ?: Text.upiRef(r.optString("description")),
                txnId = null, accountHint = null, bankName = bank,
                availableBalancePaise = if (r.has("balancePaise") && !r.isNull("balancePaise")) r.getLong("balancePaise") else null,
                appName = bank ?: "Bank statement", sourcePackage = "statement",
                sourceType = SourceType.STATEMENT_IMPORT, occurredAt = r.getLong("occurredAt"), confidence = 95,
            )
            when (repo.ingest(p)) {
                is ReconcileResult.Created -> created++
                is ReconcileResult.Updated -> updated++
                is ReconcileResult.Duplicate -> dup++
            }
        }
        repo.prefs.edit().putLong("lastStatementImport", System.currentTimeMillis()).apply()
        call.resolve(JSObject().put("created", created).put("updated", updated).put("duplicates", dup))
    }

    /** UPI payment started from Glass Finance (UPI deep-link intent). The app's reply is not proof of settlement. */
    @PluginMethod
    fun payUpi(call: PluginCall) {
        val vpa = call.getString("vpa") ?: return call.reject("vpa required")
        val amount = call.getString("amount") ?: return call.reject("amount required")
        val uri = Uri.Builder().scheme("upi").authority("pay")
            .appendQueryParameter("pa", vpa)
            .appendQueryParameter("pn", call.getString("name") ?: vpa)
            .appendQueryParameter("am", amount)
            .appendQueryParameter("cu", "INR")
            .appendQueryParameter("tn", call.getString("note") ?: "Glass Finance")
            .appendQueryParameter("tr", "GF" + System.currentTimeMillis())
            .build()
        val intent = Intent(Intent.ACTION_VIEW, uri)
        call.getString("packageName")?.let { intent.setPackage(it) }
        try {
            startActivityForResult(call, Intent.createChooser(intent, "Pay with"), "upiResult")
        } catch (e: Exception) { call.reject("No UPI app can handle this payment") }
    }

    @ActivityCallback
    private fun upiResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val resp = result.data?.getStringExtra("response") ?: result.data?.extras?.keySet()?.joinToString("&") { k -> "$k=${result.data?.extras?.get(k)}" } ?: ""
        val kv = resp.split("&").mapNotNull { it.split("=", limit = 2).takeIf { p -> p.size == 2 } }.associate { it[0].lowercase() to it[1] }
        val statusStr = (kv["status"] ?: "").uppercase()
        val status = when {
            result.resultCode != Activity.RESULT_OK && statusStr.isEmpty() -> null
            statusStr == "SUCCESS" -> TxStatus.SUCCESS
            statusStr.startsWith("FAIL") -> TxStatus.FAILED
            else -> TxStatus.PENDING // SUBMITTED or no status
        }
        if (status == null) return call.resolve(JSObject().put("recorded", false).put("status", "CANCELLED"))
        val amountPaise = Text.toPaise(call.getString("amount") ?: "0") ?: 0L
        val p = ParsedPayment(
            amountPaise = amountPaise, direction = Direction.DEBIT, status = status, counterparty = Text.cleanName(call.getString("name") ?: call.getString("vpa")),
            upiRef = kv["approvalrefno"]?.takeIf { it.matches(Regex("[0-9]{12}")) } ?: kv["responsecode"]?.takeIf { it.matches(Regex("[0-9]{12}")) },
            txnId = kv["txnid"]?.ifBlank { null }, appName = "UPI (from Glass Finance)", sourcePackage = context.packageName,
            sourceType = SourceType.APP_INITIATED_INTENT, occurredAt = System.currentTimeMillis(), confidence = 60,
        )
        repo.executor.execute {
            val r = repo.ingest(p)
            val id = when (r) { is ReconcileResult.Created -> r.tx.id; is ReconcileResult.Updated -> r.tx.id; is ReconcileResult.Duplicate -> r.existing.id }
            call.resolve(JSObject().put("recorded", true).put("status", status.name).put("id", id))
        }
    }

    @PluginMethod
    fun saveState(call: PluginCall) = bg(call) {
        val json = call.getString("json") ?: return@bg call.reject("json required")
        dao.putState(AppStateEntity("ledger", json, System.currentTimeMillis()))
        call.resolve()
    }

    @PluginMethod
    fun loadState(call: PluginCall) = bg(call) {
        val s = dao.state("ledger")
        call.resolve(JSObject().put("json", s?.json).put("updatedAt", s?.updatedAt ?: 0L))
    }

    /** Deletes everything the automatic tracker stored (records, diagnostics, merchant rules). */
    @PluginMethod
    fun clearAutoData(call: PluginCall) = bg(call) {
        dao.clearTx(); dao.clearLog(); dao.clearRules(); call.resolve()
    }

    @PluginMethod
    fun eraseEverything(call: PluginCall) = bg(call) {
        dao.clearTx(); dao.clearLog(); dao.clearRules(); dao.clearState(); repo.prefs.edit().clear().apply(); call.resolve()
    }
    @PluginMethod
    fun requestRebind(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && hasAccess()) {
            try {
                NotificationListenerService.requestRebind(ComponentName(context, PaymentNotificationListener::class.java))
            } catch (_: Exception) {}
        }
        call.resolve(JSObject().put("requested", hasAccess()))
    }

    @PluginMethod
    fun checkBiometric(call: PluginCall) {
        val bm = BiometricManager.from(context)
        val res = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        call.resolve(JSObject().put("available", res == BiometricManager.BIOMETRIC_SUCCESS).put("code", res))
    }

    @PluginMethod
    fun authenticateBiometric(call: PluginCall) {
        val act = activity ?: return call.reject("No active activity")
        val title = call.getString("title") ?: "Unlock Glass Finance"
        val subtitle = call.getString("subtitle") ?: "Verify your identity to continue"
        act.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(context)
            val prompt = BiometricPrompt(act, executor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve(JSObject().put("authenticated", true))
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.resolve(JSObject().put("authenticated", false).put("error", errString.toString()))
                }
                override fun onAuthenticationFailed() {
                    // Prompt remains open for retry.
                }
            })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .setNegativeButtonText("Use PIN")
                .build()
            prompt.authenticate(info)
        }
    }

    @PluginMethod
    fun exportPdfSummary(call: PluginCall) = bg(call) {
        val title = call.getString("title") ?: "Glass Finance Summary"
        val subtitle = call.getString("subtitle") ?: ""
        val lines = call.getArray("lines") ?: JSArray()
        val fileName = (call.getString("fileName") ?: "GlassFinance-Summary.pdf").replace(Regex("[^A-Za-z0-9._-]"), "_")
        val doc = PdfDocument()
        val titlePaint = Paint().apply { color = Color.rgb(15, 23, 42); textSize = 18f; isFakeBoldText = true; isAntiAlias = true }
        val subPaint = Paint().apply { color = Color.rgb(100, 116, 139); textSize = 11f; isAntiAlias = true }
        val bodyPaint = Paint().apply { color = Color.rgb(30, 41, 59); textSize = 11.5f; isAntiAlias = true }
        val boldPaint = Paint().apply { color = Color.rgb(15, 23, 42); textSize = 12f; isFakeBoldText = true; isAntiAlias = true }
        var pageNum = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNum).create())
        var canvas = page.canvas
        var y = 52f
        canvas.drawText(title, 44f, y, titlePaint); y += 20f
        if (subtitle.isNotBlank()) { canvas.drawText(subtitle, 44f, y, subPaint); y += 22f }
        y += 8f
        for (i in 0 until lines.length()) {
            val line = lines.optString(i, "")
            if (y > 790f) {
                doc.finishPage(page)
                pageNum++
                page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNum).create())
                canvas = page.canvas
                y = 52f
            }
            if (line.startsWith("## ")) {
                y += 6f
                canvas.drawText(line.removePrefix("## "), 44f, y, boldPaint)
                y += 18f
            } else if (line.isBlank()) {
                y += 10f
            } else {
                canvas.drawText(line.take(92), 44f, y, bodyPaint)
                y += 16f
            }
        }
        doc.finishPage(page)
        val outFile = File(context.cacheDir, fileName)
        FileOutputStream(outFile).use { doc.writeTo(it) }
        doc.close()
        val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", outFile)
        val share = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity?.runOnUiThread {
            try { context.startActivity(Intent.createChooser(share, "Share PDF summary").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }
        call.resolve(JSObject().put("exported", true).put("fileName", fileName))
    }

    private fun toJs(t: DetectedTx): JSObject = JSObject()
        .put("id", t.id).put("amountPaise", t.amountPaise).put("direction", t.direction.name).put("kind", t.kind.name)
        .put("status", t.status.name).put("counterparty", t.counterparty).put("upiRef", t.upiRef).put("txnId", t.txnId)
        .put("accountHint", t.accountHint).put("bankName", t.bankName).put("availableBalancePaise", t.availableBalancePaise)
        .put("appName", t.appName).put("sources", JSONArray(t.sources.map { it.name })).put("sourceCount", t.sourceCount)
        .put("verification", t.verification.name).put("categoryId", t.categoryId).put("occurredAt", t.occurredAt)
        .put("updatedAt", t.updatedAt).put("userEdited", t.userEdited).put("deleted", t.deleted)
        .put("countsInLedger", t.countsInLedger())
}
