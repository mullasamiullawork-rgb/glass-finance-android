package com.samiulla.glassfinance.autotrack

import android.content.Context
import android.content.SharedPreferences
import com.samiulla.glassfinance.autotrack.core.*
import com.samiulla.glassfinance.autotrack.data.*
import java.util.concurrent.Executors

/** Single entry point for detection: parse → reconcile → persist, all on one background thread so writes are serialised. */
class AutoTrackRepository private constructor(private val ctx: Context) {
    val db: GlassDb = GlassDb.get(ctx)
    private val dao get() = db.dao()
    val prefs: SharedPreferences = ctx.getSharedPreferences("autotrack", Context.MODE_PRIVATE)
    private val reconciler = Reconciler()
    val executor = Executors.newSingleThreadExecutor()
    private val recentKeys = LinkedHashMap<String, Long>()

    var listener: ((DetectedTx, String) -> Unit)? = null

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", true)
        set(v) = prefs.edit().putBoolean("enabled", v).apply()

    var autoCategorize: Boolean
        get() = prefs.getBoolean("autoCategorize", true)
        set(v) = prefs.edit().putBoolean("autoCategorize", v).apply()

    var trackBankSms: Boolean
        get() = prefs.getBoolean("trackBankSms", true)
        set(v) = prefs.edit().putBoolean("trackBankSms", v).apply()

    /** Packages the user switched off. Default: every supported app is tracked. */
    var disabledApps: Set<String>
        get() = prefs.getStringSet("disabledApps", emptySet()) ?: emptySet()
        set(v) = prefs.edit().putStringSet("disabledApps", v).apply()

    fun isAppEnabled(pkg: String): Boolean {
        val app = PaymentAppRegistry.find(pkg) ?: return false
        if (pkg in disabledApps) return false
        if (app.kind == SourceApp.Kind.SMS_APP && !trackBankSms) return false
        return true
    }

    fun markListenerEvent(name: String) = prefs.edit().putLong(name, System.currentTimeMillis()).apply()

    /** Called by the notification listener on its own thread. */
    fun handle(n: RawNotification, notificationKey: String) {
        if (!enabled || !isAppEnabled(n.packageName)) return
        // Apps re-post the same notification when it updates; skip exact repeats cheaply.
        val dedupeKey = notificationKey + "|" + n.body.hashCode()
        synchronized(recentKeys) {
            val now = System.currentTimeMillis()
            recentKeys.entries.removeIf { now - it.value > 10 * 60_000 }
            if (recentKeys.containsKey(dedupeKey)) return
            recentKeys[dedupeKey] = now
        }
        executor.execute { process(n) }
    }

    fun process(n: RawNotification): ReconcileResult? {
        val app = PaymentAppRegistry.find(n.packageName) ?: return null
        return try {
            val parsed = app.parser.parse(n)
            if (parsed == null) {
                // Only payment-looking notifications are logged, with no text kept.
                dao.log(DetectionLogEntity(at = System.currentTimeMillis(), packageName = n.packageName, outcome = "IGNORED", reason = "Not a payment notification", txId = null))
                null
            } else ingest(parsed)
        } catch (e: Exception) {
            dao.log(DetectionLogEntity(at = System.currentTimeMillis(), packageName = n.packageName, outcome = "ERROR", reason = e.javaClass.simpleName, txId = null))
            null
        }
    }

    @Synchronized
    fun ingest(p: ParsedPayment): ReconcileResult {
        val rules = if (autoCategorize) dao.rules().associate { it.merchantKey to it.categoryId } else emptyMap()
        val cat = if (autoCategorize) Categorizer(rules) else Categorizer(emptyMap())
        val existing = dao.candidates(p.occurredAt - 3L * 24 * 3600_000).map { it.toCore() }
        val r = reconciler.reconcile(p, existing, cat)
        val now = System.currentTimeMillis()
        when (r) {
            is ReconcileResult.Created -> {
                val t = if (autoCategorize) r.tx else r.tx.copy(categoryId = null)
                dao.upsert(DetectedTxEntity.from(t)); dao.log(DetectionLogEntity(at = now, packageName = p.sourcePackage, outcome = "CREATED", reason = p.sourceType.name, txId = t.id)); listener?.invoke(t, "created")
            }
            is ReconcileResult.Updated -> {
                val old = dao.get(r.tx.id)
                dao.upsert(DetectedTxEntity.from(r.tx, old?.note)); dao.log(DetectionLogEntity(at = now, packageName = p.sourcePackage, outcome = "UPDATED", reason = p.sourceType.name, txId = r.tx.id)); listener?.invoke(r.tx, "updated")
            }
            is ReconcileResult.Duplicate -> dao.log(DetectionLogEntity(at = now, packageName = p.sourcePackage, outcome = "DUPLICATE", reason = p.sourceType.name, txId = r.existing.id))
        }
        dao.pruneLog(now - 60L * 24 * 3600_000)
        return r
    }

    /** True only while the user has granted notification access to this app. Revoking it in Android settings makes this false immediately. */
    fun hasNotificationAccess(): Boolean =
        androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)

    companion object {
        /** Tests only: forget the singleton (simulates a process restart). */
        fun resetForTests() { inst = null; GlassDb.resetForTests() }
        @Volatile private var inst: AutoTrackRepository? = null
        fun get(ctx: Context) = inst ?: synchronized(this) { inst ?: AutoTrackRepository(ctx.applicationContext).also { inst = it } }
    }
}
