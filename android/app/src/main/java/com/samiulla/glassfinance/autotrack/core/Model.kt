package com.samiulla.glassfinance.autotrack.core

/**
 * Pure-Kotlin model for automatic transaction detection. No Android imports here,
 * so everything in this package is covered by JVM unit tests.
 */

/** Which way the money moved, from the user's point of view. */
enum class Direction { DEBIT, CREDIT, UNKNOWN }

/** Final classification shown to the user. */
enum class TxKind { EXPENSE, INCOME, REFUND, TRANSFER, REVERSAL, UNKNOWN }

/** Payment lifecycle status as reported by the source. */
enum class TxStatus { SUCCESS, PENDING, FAILED, REVERSED }

/** Where the evidence came from. Higher rank = stronger evidence. */
enum class SourceType(val rank: Int) {
    UPI_APP_NOTIFICATION(1),
    APP_INITIATED_INTENT(1),
    BANK_SMS_NOTIFICATION(2),
    STATEMENT_IMPORT(3),
    ACCOUNT_AGGREGATOR(4),
}

/**
 * How much the record can be trusted.
 * PROVISIONAL: one source, a payment app's own notification.
 * CONFIRMED: a bank alert, or two independent sources agree.
 * BANK_VERIFIED: bank statement / Account Aggregator data (only when such a source actually provided it).
 */
enum class Verification { PROVISIONAL, CONFIRMED, BANK_VERIFIED }

/** The raw text the notification listener hands to a parser. */
data class RawNotification(
    val packageName: String,
    val title: String?,
    val text: String?,
    val bigText: String?,
    val subText: String?,
    val postedAt: Long,
) {
    /** All visible text joined, normalised for parsing. */
    val body: String get() = listOfNotNull(title, bigText ?: text, subText)
        .joinToString(" \n ")
        .replace('\u00a0', ' ')
}

/** One payment event extracted from one piece of evidence. Fields are null when the source did not expose them. */
data class ParsedPayment(
    val amountPaise: Long,
    val direction: Direction,
    val status: TxStatus,
    val kindHint: TxKind? = null,
    val counterparty: String? = null,
    val upiRef: String? = null,
    val txnId: String? = null,
    val accountHint: String? = null,
    val bankName: String? = null,
    val availableBalancePaise: Long? = null,
    val appName: String,
    val sourcePackage: String,
    val sourceType: SourceType,
    val occurredAt: Long,
    val confidence: Int,
)

/** A reconciled transaction as stored by the app (mirrors the Room entity, without Android types). */
data class DetectedTx(
    val id: String,
    val amountPaise: Long,
    val direction: Direction,
    val kind: TxKind,
    val status: TxStatus,
    val counterparty: String?,
    val upiRef: String?,
    val txnId: String?,
    val accountHint: String?,
    val bankName: String?,
    val availableBalancePaise: Long?,
    val appName: String,
    val sources: Set<SourceType>,
    val sourceCount: Int,
    val verification: Verification,
    val categoryId: String?,
    val occurredAt: Long,
    val updatedAt: Long,
    val userEdited: Boolean = false,
    val deleted: Boolean = false,
)
