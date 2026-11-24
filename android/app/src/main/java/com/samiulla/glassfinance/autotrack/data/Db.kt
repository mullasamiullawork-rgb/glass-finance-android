package com.samiulla.glassfinance.autotrack.data

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import com.samiulla.glassfinance.autotrack.core.*

/** One reconciled automatic transaction. Raw notification text is never stored. */
@Entity(tableName = "detected_tx", indices = [Index("upiRef"), Index("txnId"), Index("occurredAt")])
data class DetectedTxEntity(
    @PrimaryKey val id: String,
    val amountPaise: Long,
    val direction: String,
    val kind: String,
    val status: String,
    val counterparty: String?,
    val upiRef: String?,
    val txnId: String?,
    val accountHint: String?,
    val bankName: String?,
    val availableBalancePaise: Long?,
    val appName: String,
    val sources: String,
    val sourceCount: Int,
    val verification: String,
    val categoryId: String?,
    val note: String?,
    val occurredAt: Long,
    val updatedAt: Long,
    val userEdited: Boolean,
    val deleted: Boolean,
) {
    fun toCore() = DetectedTx(
        id, amountPaise, Direction.valueOf(direction), TxKind.valueOf(kind), TxStatus.valueOf(status), counterparty, upiRef, txnId,
        accountHint, bankName, availableBalancePaise, appName,
        sources.split(',').filter { it.isNotBlank() }.map { SourceType.valueOf(it) }.toSet(), sourceCount,
        Verification.valueOf(verification), categoryId, occurredAt, updatedAt, userEdited, deleted,
    )

    companion object {
        fun from(t: DetectedTx, note: String? = null) = DetectedTxEntity(
            t.id, t.amountPaise, t.direction.name, t.kind.name, t.status.name, t.counterparty, t.upiRef, t.txnId, t.accountHint,
            t.bankName, t.availableBalancePaise, t.appName, t.sources.joinToString(",") { it.name }, t.sourceCount,
            t.verification.name, t.categoryId, note, t.occurredAt, t.updatedAt, t.userEdited, t.deleted,
        )
    }
}

/** Diagnostics: one row per handled notification. Stores the outcome only, never the notification text. */
@Entity(tableName = "detection_log", indices = [Index("at")])
data class DetectionLogEntity(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0,
    val at: Long,
    val packageName: String,
    val outcome: String, // CREATED, UPDATED, DUPLICATE, IGNORED, ERROR
    val reason: String?,
    val txId: String?,
)

/** Merchant → category corrections the user made. */
@Entity(tableName = "merchant_rule")
data class MerchantRuleEntity(@PrimaryKey val merchantKey: String, val categoryId: String, val updatedAt: Long)

/** Durable copy of the app's whole ledger (the web layer's JSON state), so data survives WebView storage loss. */
@Entity(tableName = "app_state")
data class AppStateEntity(@PrimaryKey val key: String, val json: String, val updatedAt: Long)

@Dao
interface AutoDao {
    @Query("SELECT * FROM detected_tx ORDER BY occurredAt DESC")
    fun all(): List<DetectedTxEntity>

    @Query("SELECT * FROM detected_tx WHERE occurredAt >= :since OR upiRef IS NOT NULL OR txnId IS NOT NULL ORDER BY occurredAt DESC LIMIT 2000")
    fun candidates(since: Long): List<DetectedTxEntity>

    @Query("SELECT * FROM detected_tx WHERE updatedAt > :since ORDER BY updatedAt ASC")
    fun changedSince(since: Long): List<DetectedTxEntity>

    @Query("SELECT * FROM detected_tx WHERE id = :id")
    fun get(id: String): DetectedTxEntity?

    @Upsert fun upsert(e: DetectedTxEntity)

    @Query("DELETE FROM detected_tx") fun clearTx()

    @Insert fun log(e: DetectionLogEntity)

    @Query("SELECT * FROM detection_log ORDER BY at DESC LIMIT :limit")
    fun recentLog(limit: Int): List<DetectionLogEntity>

    @Query("SELECT outcome, COUNT(*) AS n FROM detection_log GROUP BY outcome")
    fun outcomeCounts(): List<OutcomeCount>

    @Query("SELECT MAX(at) FROM detection_log WHERE outcome IN ('CREATED','UPDATED')")
    fun lastDetection(): Long?

    @Query("DELETE FROM detection_log WHERE at < :before") fun pruneLog(before: Long)
    @Query("DELETE FROM detection_log") fun clearLog()

    @Upsert fun putRule(r: MerchantRuleEntity)
    @Query("SELECT * FROM merchant_rule") fun rules(): List<MerchantRuleEntity>
    @Query("DELETE FROM merchant_rule") fun clearRules()

    @Upsert fun putState(s: AppStateEntity)
    @Query("SELECT * FROM app_state WHERE `key` = :key") fun state(key: String): AppStateEntity?
    @Query("DELETE FROM app_state") fun clearState()
}

data class OutcomeCount(val outcome: String, val n: Int)

@Database(entities = [DetectedTxEntity::class, DetectionLogEntity::class, MerchantRuleEntity::class, AppStateEntity::class], version = 1, exportSchema = false)
abstract class GlassDb : RoomDatabase() {
    abstract fun dao(): AutoDao

    companion object {
        /** Add future migrations here, e.g. MIGRATION_1_2. Destructive migration is never enabled: financial data must not be dropped. */
        val MIGRATIONS: Array<Migration> = arrayOf()

        @Volatile private var instance: GlassDb? = null
        fun resetForTests() { instance?.close(); instance = null; allowMainThreadForTests = true }
        @Volatile var allowMainThreadForTests = false
        fun get(ctx: Context): GlassDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(ctx.applicationContext, GlassDb::class.java, "glass_finance.db")
                .addMigrations(*MIGRATIONS)
                .apply { if (allowMainThreadForTests) allowMainThreadQueries() }
                .build().also { instance = it }
        }
    }
}
