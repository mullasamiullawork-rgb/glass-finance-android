package com.samiulla.glassfinance.autotrack.core

import java.util.Locale
import java.util.UUID
import kotlin.math.abs

/** Merchant → category. User corrections always win over the built-in keyword rules. */
class Categorizer(private val userRules: Map<String, String> = emptyMap()) {
    companion object {
        fun key(name: String?): String = (name ?: "").lowercase(Locale.ROOT).replace(Regex("""[^a-z0-9]+"""), " ").trim()

        private val RULES: List<Pair<String, Regex>> = listOf(
            "cat_groceries" to Regex("""\b(grocery|groceries|kirana|supermarket|super\s*market|mart|dmart|d mart|bigbasket|big basket|blinkit|zepto|instamart|jiomart|reliance fresh|more retail|ratnadeep|vegetable|fruits?|provision|general stores?)\b"""),
            "cat_food" to Regex("""\b(tea|chai|coffee|cafe|caf|restaurant|hotel|dhaba|bakery|bakers|sweets?|tiffin|canteen|mess|biryani|pizza|burger|swiggy|zomato|food|kitchen|juice|ice cream|eatery|kfc|mcdonald|domino|starbucks|chaayos|haldiram)\b"""),
            "cat_transport" to Regex("""\b(petrol|fuel|diesel|filling station|service station|hp\s|hpcl|bpcl|iocl|indian oil|bharat petroleum|bus|apsrtc|tsrtc|ksrtc|redbus|uber|ola|rapido|auto|taxi|cab|metro|irctc|railway|parking|fastag|toll)\b"""),
            "cat_health" to Regex("""\b(hospital|clinic|medical|medicals|pharmacy|pharma|chemist|apollo|medplus|netmeds|pharmeasy|1mg|diagnostic|lab|dental|doctor|health)\b"""),
            "cat_bills" to Regex("""\b(recharge|jio|airtel|vi\b|vodafone|bsnl|electricity|apspdcl|apcpdcl|tsspdcl|power|water bill|gas|indane|bharat gas|hp gas|broadband|internet|act fibernet|dth|tata play|bill\s*desk|billdesk|postpaid|prepaid)\b"""),
            "cat_education" to Regex("""\b(school|college|university|institute|academy|coaching|tuition|exam|fees?|coursera|udemy|byju|unacademy|physics wallah|pw\b|books?|stationery|xerox)\b"""),
            "cat_subscriptions" to Regex("""\b(netflix|spotify|youtube|prime video|hotstar|jiocinema|jiohotstar|apple|google play|subscription|membership)\b"""),
            "cat_entertainment" to Regex("""\b(bookmyshow|pvr|inox|cinema|theatre|theater|movie|games?|gaming|district)\b"""),
            "cat_shopping" to Regex("""\b(amazon|flipkart|myntra|ajio|meesho|nykaa|store|stores|retail|mall|fashion|clothing|garments|textiles|footwear|electronics|mobiles?|croma|reliance digital|decathlon|trends|shop|shopping)\b"""),
        )
    }

    fun categorize(kind: TxKind, counterparty: String?): String? = when (kind) {
        TxKind.REFUND -> "cat_refunds"
        TxKind.REVERSAL -> "cat_refunds"
        TxKind.TRANSFER, TxKind.UNKNOWN -> null
        TxKind.INCOME -> userRules[key(counterparty)] ?: "cat_received"
        TxKind.EXPENSE -> {
            val k = key(counterparty)
            userRules[k] ?: RULES.firstOrNull { it.second.containsMatchIn(" $k ") }?.first ?: "cat_other"
        }
    }
}

object Classifier {
    /** Incoming money is "Money received", never assumed to be earnings; the user can recategorise. */
    fun kind(p: ParsedPayment): TxKind = p.kindHint ?: when (p.direction) {
        Direction.DEBIT -> TxKind.EXPENSE
        Direction.CREDIT -> TxKind.INCOME
        Direction.UNKNOWN -> TxKind.UNKNOWN
    }
}

sealed class ReconcileResult {
    data class Created(val tx: DetectedTx) : ReconcileResult()
    data class Updated(val before: DetectedTx, val tx: DetectedTx) : ReconcileResult()
    data class Duplicate(val existing: DetectedTx) : ReconcileResult()
}

/**
 * Central reconciliation. Guarantees:
 *  - Same UPI reference / bank reference / transaction id → one transaction (idempotent).
 *  - Evidence from a different source type (app notification vs bank alert) with the same amount, direction and a close
 *    timestamp, and no conflicting reference, is merged into the existing record.
 *  - Two payments of the same amount from the same kind of source are NOT merged unless the counterparty matches,
 *    they are within [sameSourceWindowMs], and it is a status progression or an exact re-post.
 *  - Stronger evidence upgrades status and verification of the existing record instead of creating a new one.
 */
class Reconciler(
    private val crossSourceWindowMs: Long = 15 * 60_000L,
    private val sameSourceWindowMs: Long = 90_000L,
    private val clock: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { "auto_" + UUID.randomUUID().toString().replace("-", "").take(20) },
) {
    fun reconcile(p: ParsedPayment, existing: List<DetectedTx>, categorizer: Categorizer = Categorizer()): ReconcileResult {
        // 1. Strong identifiers.
        val strong = existing.firstOrNull { e ->
         !e.deleted && (
                 (p.upiRef != null && (e.upiRef == p.upiRef || e.txnId == p.upiRef)) ||
                    (p.txnId != null && (e.txnId == p.txnId || e.upiRef == p.txnId))
         )
        }
        if (strong != null) return mergeOrDuplicate(strong, p)

        // 2. Fuzzy candidates.
        val candidates = existing.filter { e ->
            !e.deleted && e.amountPaise == p.amountPaise && dirCompatible(e.direction, p.direction) &&
                !refsConflict(e, p) && nameCompatible(e.counterparty, p.counterparty)
        }.filter { e ->
            val dt = abs(e.occurredAt - p.occurredAt)
            val crossSource = p.sourceType !in e.sources
            if (crossSource) dt <= crossSourceWindowMs
            else dt <= sameSourceWindowMs && e.counterparty != null && p.counterparty != null &&
                Categorizer.key(e.counterparty) == Categorizer.key(p.counterparty) &&
                (isProgression(e.status, p.status) || e.status == p.status)
        }.sortedBy { abs(it.occurredAt - p.occurredAt) }

        val match = candidates.firstOrNull()
        if (match != null) return mergeOrDuplicate(match, p)

        // 3. New transaction.
        val kind = Classifier.kind(p)
        val now = clock()
        // A standalone reversal/refund credit is money that actually arrived, so it is a successful credit.
        val status = if (kind == TxKind.REVERSAL && p.direction == Direction.CREDIT) TxStatus.SUCCESS else p.status
        return ReconcileResult.Created(
            DetectedTx(
                id = newId(), amountPaise = p.amountPaise, direction = p.direction, kind = kind, status = status,
                counterparty = p.counterparty, upiRef = p.upiRef, txnId = p.txnId, accountHint = p.accountHint,
                bankName = p.bankName, availableBalancePaise = p.availableBalancePaise, appName = p.appName,
                sources = setOf(p.sourceType), sourceCount = 1, verification = verificationFor(setOf(p.sourceType)),
                categoryId = categorizer.categorize(kind, p.counterparty), occurredAt = p.occurredAt, updatedAt = now,
            )
        )
    }

    private fun mergeOrDuplicate(e: DetectedTx, p: ParsedPayment): ReconcileResult {
        val sources = e.sources + p.sourceType
        val newStatus = mergeStatus(e.status, p.status)
        val merged = e.copy(
            status = newStatus,
            counterparty = e.counterparty ?: p.counterparty,
            upiRef = e.upiRef ?: p.upiRef,
            txnId = e.txnId ?: p.txnId,
            accountHint = e.accountHint ?: p.accountHint,
            bankName = e.bankName ?: p.bankName,
            availableBalancePaise = p.availableBalancePaise ?: e.availableBalancePaise,
            direction = if (e.direction == Direction.UNKNOWN) p.direction else e.direction,
            kind = if (e.userEdited) e.kind
                else if (newStatus == TxStatus.REVERSED && e.kind == TxKind.EXPENSE) e.kind
                else if (e.kind == TxKind.UNKNOWN) Classifier.kind(p) else e.kind,
            sources = sources,
            sourceCount = e.sourceCount + 1,
            verification = maxOf(e.verification, verificationFor(sources)),
        )
        val changed = merged.copy(sourceCount = e.sourceCount, updatedAt = e.updatedAt) != e
        return if (changed) ReconcileResult.Updated(e, merged.copy(updatedAt = clock()))
        else ReconcileResult.Duplicate(e)
    }

    companion object {
        fun verificationFor(sources: Set<SourceType>): Verification = when {
            sources.any { it == SourceType.STATEMENT_IMPORT || it == SourceType.ACCOUNT_AGGREGATOR } -> Verification.BANK_VERIFIED
            SourceType.BANK_SMS_NOTIFICATION in sources -> Verification.CONFIRMED
            sources.size >= 2 -> Verification.CONFIRMED
            else -> Verification.PROVISIONAL
        }

        fun dirCompatible(a: Direction, b: Direction) = a == b || a == Direction.UNKNOWN || b == Direction.UNKNOWN

        fun refsConflict(e: DetectedTx, p: ParsedPayment): Boolean =
            (e.upiRef != null && p.upiRef != null && e.upiRef != p.upiRef) ||
                (e.txnId != null && p.txnId != null && e.txnId != p.txnId)

        /** Names are compatible when either is missing, or one contains the other after normalising (bank SMS often truncate). */
        fun nameCompatible(a: String?, b: String?): Boolean {
            if (a == null || b == null) return true
            val x = Categorizer.key(a).replace(" ", ""); val y = Categorizer.key(b).replace(" ", "")
            if (x.isEmpty() || y.isEmpty()) return true
            return x.contains(y) || y.contains(x) || x.take(5) == y.take(5)
        }

        fun isProgression(from: TxStatus, to: TxStatus) = from == TxStatus.PENDING && to != TxStatus.PENDING

        /** PENDING → SUCCESS/FAILED; SUCCESS → REVERSED. A later PENDING never downgrades a final status. */
        fun mergeStatus(old: TxStatus, new: TxStatus): TxStatus = when {
            old == new -> old
            new == TxStatus.REVERSED -> TxStatus.REVERSED
            old == TxStatus.PENDING -> new
            old == TxStatus.REVERSED -> old
            new == TxStatus.PENDING -> old
            old == TxStatus.FAILED && new == TxStatus.SUCCESS -> TxStatus.SUCCESS // bank alert proves money moved
            else -> old
        }
    }
}

/** True when the record should count in the ledger (balances, income, expenses). */
fun DetectedTx.countsInLedger(): Boolean =
    !deleted && status == TxStatus.SUCCESS && kind != TxKind.UNKNOWN
