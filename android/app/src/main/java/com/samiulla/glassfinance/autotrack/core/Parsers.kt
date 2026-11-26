package com.samiulla.glassfinance.autotrack.core

import java.util.Locale

/** A parser turns one notification into a payment, or null when it isn't a payment. */
interface NotificationParser {
    fun parse(n: RawNotification): ParsedPayment?
}

/** Shared regexes and helpers for Indian payment text. */
object Text {
    // ₹1,250.50 | Rs. 500 | Rs 1,50,000 | INR 250 | 250.00 INR
    private val AMOUNT = Regex("""(?:₹|\bRs\.?|\bINR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
    private val AMOUNT_SUFFIX = Regex("""\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:INR|rupees)\b""", RegexOption.IGNORE_CASE)
    // SBI-style "debited by 50.0" / "credited with 1000" without a currency marker
    private val AMOUNT_VERB = Regex("""\b(?:debited|credited)\s+(?:by|with|for)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b""", RegexOption.IGNORE_CASE)
    private val BAL_CONTEXT = Regex("""(?:avl|avbl|available|a/c|acct)?\.?\s*bal(?:ance)?\.?\s*(?:is|:|-)?\s*(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)

    // 12-digit UPI RRN / UTR
    private val UPI_REF = Regex("""(?:UPI\s*(?:Ref|Ref\.?\s*No|ref\s*id|transaction\s*id|txn\s*id)?|UTR|RRN|Ref(?:erence)?(?:\s*No)?\.?)\s*[:#.\-]?\s*(?:no\.?\s*)?([0-9]{12})\b""", RegexOption.IGNORE_CASE)
    private val BARE_12 = Regex("""\b([0-9]{12})\b""")
    private val TXN_ID = Regex("""(?:Txn|Transaction|Order)\s*(?:ID|No|#)\.?\s*[:#\-]?\s*([A-Z0-9]{8,35})""", RegexOption.IGNORE_CASE)
    private val ACCOUNT = Regex("""(?:a/c|acct|account|card)\s*(?:no\.?)?\s*(?:ending\s*(?:with)?\s*)?[xX*]*\s*([0-9]{3,6})\b""", RegexOption.IGNORE_CASE)

    // Content that must never be processed or stored.
    private val SENSITIVE = Regex("""\b(OTP|one[\s-]?time\s*pass(?:word|code)?|verification\s*code|password|passcode|PIN\s+is|do\s+not\s+share|never\s+share)\b""", RegexOption.IGNORE_CASE)
    private val PROMO = Regex("""\b(cashback\s+(?:up\s*to|offer)|win\s+up\s*to|offer|coupon|pre-?approved|loan\s+(?:of|up\s*to)|apply\s+now|limited\s+period|scratch\s*card|reward|voucher|EMI\s+starting|insurance\s+plan)\b""", RegexOption.IGNORE_CASE)
    private val REQUEST = Regex("""\b(has\s+requested|requested\s+(?:money|₹|Rs)|collect\s+request|payment\s+request|is\s+requesting|request\s+from|pay\s+(?:₹|Rs)[^\n]*\?|due\s+(?:on|date|by)|bill\s+(?:is\s+)?due|reminder)\b""", RegexOption.IGNORE_CASE)

    fun isSensitive(s: String) = SENSITIVE.containsMatchIn(s)
    fun isPromo(s: String) = PROMO.containsMatchIn(s)
    fun isRequestOrReminder(s: String) = REQUEST.containsMatchIn(s)

    fun toPaise(num: String): Long? {
        val clean = num.replace(",", "")
        val parts = clean.split(".")
        return try {
            val rupees = parts[0].toLong()
            val paise = if (parts.size > 1) parts[1].padEnd(2, '0').take(2).toLong() else 0L
            rupees * 100 + paise
        } catch (e: NumberFormatException) { null }
    }

    /** First transaction amount, skipping any amount that is clearly a balance. */
    fun amount(s: String): Long? {
        val balRanges = BAL_CONTEXT.findAll(s).map { it.range }.toList()
        val m = AMOUNT.findAll(s).firstOrNull { a -> balRanges.none { r -> a.range.first in r } }
            ?: AMOUNT_VERB.find(s) ?: AMOUNT_SUFFIX.find(s)
        return m?.let { toPaise(it.groupValues[1]) }?.takeIf { it > 0 }
    }

    fun balance(s: String): Long? = BAL_CONTEXT.find(s)?.let { toPaise(it.groupValues[1]) }

    fun upiRef(s: String): String? = UPI_REF.find(s)?.groupValues?.get(1)
        ?: if (Regex("""\bUPI\b""", RegexOption.IGNORE_CASE).containsMatchIn(s)) BARE_12.find(s)?.groupValues?.get(1) else null

    fun txnId(s: String): String? = TXN_ID.find(s)?.groupValues?.get(1)?.takeIf { it.any(Char::isDigit) }
    fun account(s: String): String? = ACCOUNT.find(s)?.groupValues?.get(1)

    /** Tidy a captured counterparty name. */
    fun cleanName(raw: String?): String? {
        if (raw == null) return null
        var n = raw.trim()
            .replace(Regex("""\s+(?:on|via|using|through|from|to|at)\s+(?:Paytm|Google\s*Pay|GPay|PhonePe|BHIM|UPI|Amazon\s*Pay).*$""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*(?:\(|\[|UPI\s*Ref|Ref\b|Txn|on\s+\d|\.\s|,\s*UPI).*$""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""[.,:;!\-]+$"""), "")
            .trim()
        if (n.length < 2 || n.length > 60) return null
        if (Regex("""^[0-9@.\s]+$""").matches(n)) return null
        if (Regex("""^(you|your|a/c|account|bank|upi|successful|success)$""", RegexOption.IGNORE_CASE).matches(n)) return null
        // VPA like teashop@ybl → "teashop"
        if (n.contains('@') && !n.contains(' ')) n = n.substringBefore('@')
        return n.split(' ').joinToString(" ") { w ->
            if (w.length > 3 && w == w.uppercase(Locale.ROOT)) w.lowercase(Locale.ROOT).replaceFirstChar { it.titlecase(Locale.ROOT) } else w
        }
    }
}

/** Status/direction keyword vocabulary shared by the UPI-app parsers. */
object Vocab {
    val FAILED = Regex("""\b(failed|failure|declined|unsuccessful|could\s*not\s*be\s*(?:completed|processed)|was\s+not\s+successful|rejected|cancelled|expired)\b""", RegexOption.IGNORE_CASE)
    val PENDING = Regex("""\b(pending|processing|in\s+progress|awaiting|under\s+process|will\s+be\s+(?:credited|updated)\s+(?:shortly|soon))\b""", RegexOption.IGNORE_CASE)
    val REFUND = Regex("""\b(refund(?:ed)?|money\s+(?:returned|back)|returned\s+to\s+your)\b""", RegexOption.IGNORE_CASE)
    val REVERSAL = Regex("""\b(revers(?:ed|al)|auto[\s-]?reversed|chargeback)\b""", RegexOption.IGNORE_CASE)
    val SENT = Regex("""\b(paid|sent|debited|payment\s+(?:of|to)|you\s+paid|transferred\s+to|paid\s+to|money\s+sent|payment\s+successful|spent|withdrawn|purchase)\b""", RegexOption.IGNORE_CASE)
    val RECEIVED = Regex("""\b(received|credited|got|added\s+to\s+your|has\s+sent\s+you|sent\s+you|deposited|you\s+have\s+received)\b""", RegexOption.IGNORE_CASE)
    val SELF = Regex("""\b(self\s*transfer|to\s+your\s+own|own\s+account|between\s+your\s+accounts|to\s+self)\b""", RegexOption.IGNORE_CASE)
}

/**
 * Generic UPI-app parser. Each supported app gets its own instance with its own name
 * and any app-specific counterparty patterns, tried before the generic ones.
 */
open class UpiAppParser(
    private val appName: String,
    private val packageName: String,
    private val extraSentName: List<Regex> = emptyList(),
    private val extraReceivedName: List<Regex> = emptyList(),
) : NotificationParser {

    private val sentName = extraSentName + listOf(
        Regex("""(?:paid|sent|payment\s+of\s+\S+\s+to|transferred|payment\s+to|paid\s+successfully\s+to)\s+(?:₹\s*[0-9,.]+\s+)?(?:Rs\.?\s*[0-9,.]+\s+)?to\s+([^\n]+?)(?=\s+(?:via|using|on|from|successfully|UPI|ref|is)\b|[.\n]|$)""", RegexOption.IGNORE_CASE),
        Regex("""\bto\s+([A-Za-z0-9][^\n]{1,50}?)(?=\s+(?:via|using|on|from|successfully|UPI|ref|is|was)\b|[.\n]|$)""", RegexOption.IGNORE_CASE),
    )
    private val receivedName = extraReceivedName + listOf(
        Regex("""^([^\n]+?)\s+(?:has\s+)?sent\s+you""", RegexOption.IGNORE_CASE),
        Regex("""(?:received|got|credited)\s+(?:₹\s*[0-9,.]+\s+|Rs\.?\s*[0-9,.]+\s+)?from\s+([^\n]+?)(?=\s+(?:via|using|on|in|to|UPI|ref)\b|[.\n]|$)""", RegexOption.IGNORE_CASE),
        Regex("""\bfrom\s+([A-Za-z0-9][^\n]{1,50}?)(?=\s+(?:via|using|on|in|to|UPI|ref)\b|[.\n]|$)""", RegexOption.IGNORE_CASE),
    )

    override fun parse(n: RawNotification): ParsedPayment? {
        val s = n.body
        if (Text.isSensitive(s) || Text.isRequestOrReminder(s)) return null
        val amount = Text.amount(s) ?: return null
        if (Text.isPromo(s) && !Vocab.SENT.containsMatchIn(s) && !Vocab.RECEIVED.containsMatchIn(s)) return null

        val failed = Vocab.FAILED.containsMatchIn(s)
        val pending = !failed && Vocab.PENDING.containsMatchIn(s)
        val reversal = Vocab.REVERSAL.containsMatchIn(s)
        val refund = !reversal && Vocab.REFUND.containsMatchIn(s)
        val received = Vocab.RECEIVED.containsMatchIn(s)
        val sent = Vocab.SENT.containsMatchIn(s)

        val direction = when {
            refund || reversal -> Direction.CREDIT
            received && !sent -> Direction.CREDIT
            sent && !received -> Direction.DEBIT
            sent && received -> if (Regex("""sent\s+you|received""", RegexOption.IGNORE_CASE).containsMatchIn(s)) Direction.CREDIT else Direction.DEBIT
            else -> Direction.UNKNOWN
        }
        if (direction == Direction.UNKNOWN && !failed && !pending) return null

        val status = when {
            failed -> TxStatus.FAILED
            reversal -> TxStatus.REVERSED
            pending -> TxStatus.PENDING
            else -> TxStatus.SUCCESS
        }
        val kindHint = when {
            reversal -> TxKind.REVERSAL
            refund -> TxKind.REFUND
            Vocab.SELF.containsMatchIn(s) -> TxKind.TRANSFER
            else -> null
        }
        val patterns = if (direction == Direction.CREDIT) receivedName else sentName
        val name = patterns.firstNotNullOfOrNull { p -> Text.cleanName(p.find(s)?.groupValues?.get(1)) }

        var conf = 60
        if (name != null) conf += 10
        if (Text.upiRef(s) != null) conf += 20
        if (direction == Direction.UNKNOWN) conf -= 30

        return ParsedPayment(
            amountPaise = amount,
            direction = direction,
            status = status,
            kindHint = kindHint,
            counterparty = name,
            upiRef = Text.upiRef(s),
            txnId = Text.txnId(s),
            accountHint = Text.account(s),
            availableBalancePaise = null,
            appName = appName,
            sourcePackage = packageName,
            sourceType = SourceType.UPI_APP_NOTIFICATION,
            occurredAt = n.postedAt,
            confidence = conf.coerceIn(0, 100),
        )
    }
}

/**
 * Bank transaction alerts, read from the notification an SMS app shows (no READ_SMS permission).
 * Accepts only messages that look like debit/credit alerts; drops OTPs, promos and everything else.
 */
class BankSmsParser(private val smsAppName: String, private val packageName: String) : NotificationParser {
    private val DEBIT = Regex("""\b(debited|debit(?:ed)?\s+(?:by|with|for)|spent|withdrawn|sent|paid|transferred\s+to|dr\.?)\b""", RegexOption.IGNORE_CASE)
    private val CREDIT = Regex("""\b(credited|credit(?:ed)?\s+(?:by|with)|received|deposited|cr\.?)\b""", RegexOption.IGNORE_CASE)
    private val ACCOUNTISH = Regex("""\b(a/c|acct|account|card|UPI|IMPS|NEFT|RTGS|VPA)\b""", RegexOption.IGNORE_CASE)
    private val BANKS = linkedMapOf(
        "SBI" to Regex("""\b(SBI|State\s+Bank)\b""", RegexOption.IGNORE_CASE),
        "HDFC Bank" to Regex("""\bHDFC\b""", RegexOption.IGNORE_CASE),
        "ICICI Bank" to Regex("""\bICICI\b""", RegexOption.IGNORE_CASE),
        "Axis Bank" to Regex("""\bAxis\b""", RegexOption.IGNORE_CASE),
        "Kotak" to Regex("""\bKotak\b""", RegexOption.IGNORE_CASE),
        "Bank of Baroda" to Regex("""\b(BoB|Bank\s+of\s+Baroda)\b""", RegexOption.IGNORE_CASE),
        "Canara Bank" to Regex("""\bCanara\b""", RegexOption.IGNORE_CASE),
        "Union Bank" to Regex("""\bUnion\s+Bank\b""", RegexOption.IGNORE_CASE),
        "PNB" to Regex("""\b(PNB|Punjab\s+National)\b""", RegexOption.IGNORE_CASE),
        "India Post Payments Bank" to Regex("""\b(IPPB|India\s+Post\s+Payments?)\b""", RegexOption.IGNORE_CASE),
        "Indian Bank" to Regex("""\bIndian\s+Bank\b""", RegexOption.IGNORE_CASE),
        "Paytm Payments Bank" to Regex("""\bPaytm\s+Payments?\s+Bank\b""", RegexOption.IGNORE_CASE),
        "Airtel Payments Bank" to Regex("""\bAirtel\s+Payments?\s+Bank\b""", RegexOption.IGNORE_CASE),
       "Yes Bank" to Regex("""\bYes\s+Bank\b""", RegexOption.IGNORE_CASE),
       "IndusInd Bank" to Regex("""\bIndusInd\b""", RegexOption.IGNORE_CASE),
       "IDFC First Bank" to Regex("""\bIDFC\s*(?:First)?\b""", RegexOption.IGNORE_CASE),
       "Federal Bank" to Regex("""\bFederal\s+Bank\b""", RegexOption.IGNORE_CASE),
       "RBL Bank" to Regex("""\bRBL\s+Bank\b""", RegexOption.IGNORE_CASE),
       "HSBC" to Regex("""\bHSBC\b""", RegexOption.IGNORE_CASE),
       "AU Small Finance Bank" to Regex("""\bAU\s+(?:Small\s+Finance\s+)?Bank\b""", RegexOption.IGNORE_CASE),
       "Bandhan Bank" to Regex("""\bBandhan\s+Bank\b""", RegexOption.IGNORE_CASE),
    )
    private val TO = Regex("""(?:to|trf\s+to|towards|at|;)\s+(?:VPA\s+)?([A-Za-z0-9@._ ]{2,40}?)(?=\s+(?:on|ref|UPI|Avl|avbl|via|if|Not|\.|$)|[.;\n]|$)""", RegexOption.IGNORE_CASE)
    private val FROM = Regex("""(?:from|by|frm)\s+(?:VPA\s+)?([A-Za-z0-9@._ ]{2,40}?)(?=\s+(?:on|ref|UPI|Avl|avbl|via|\.|$)|[.;\n]|$)""", RegexOption.IGNORE_CASE)

    override fun parse(n: RawNotification): ParsedPayment? {
        val s = n.body
        if (Text.isSensitive(s) || Text.isRequestOrReminder(s)) return null
        if (!ACCOUNTISH.containsMatchIn(s)) return null
        val isDebit = DEBIT.containsMatchIn(s)
        val isCredit = CREDIT.containsMatchIn(s)
        if (!isDebit && !isCredit) return null
        if (Text.isPromo(s) && !Regex("""\b(debited|credited|spent|charged|withdrawn)\b""", RegexOption.IGNORE_CASE).containsMatchIn(s)) return null
        val amount = Text.amount(s) ?: return null

        val reversal = Vocab.REVERSAL.containsMatchIn(s)
        val refund = !reversal && Vocab.REFUND.containsMatchIn(s)
        val failed = Vocab.FAILED.containsMatchIn(s)
        val direction = when {
            reversal || refund -> Direction.CREDIT
            isDebit && !isCredit -> Direction.DEBIT
            isCredit && !isDebit -> Direction.CREDIT
            // "credited to ... debited from your a/c": whichever verb is about "your a/c" first wins
            else -> if ((Regex("""\bdebited\b""", RegexOption.IGNORE_CASE).find(s)?.range?.first ?: Int.MAX_VALUE) <
                (Regex("""\bcredited\b""", RegexOption.IGNORE_CASE).find(s)?.range?.first ?: Int.MAX_VALUE)) Direction.DEBIT else Direction.CREDIT
        }
        val bank = BANKS.entries.firstOrNull { it.value.containsMatchIn(s) }?.key
        val nameRx = if (direction == Direction.DEBIT) TO else FROM
        val name = nameRx.findAll(s).map { Text.cleanName(it.groupValues[1]) }
            .firstOrNull { it != null && !Regex("""(?i)^(your|a/c|ac|acct|account|you)\b""").containsMatchIn(it) && !it.matches(Regex("""(?i)x+\d+""")) }

        return ParsedPayment(
            amountPaise = amount,
            direction = direction,
            status = when { failed -> TxStatus.FAILED; reversal -> TxStatus.REVERSED; else -> TxStatus.SUCCESS },
            kindHint = when { reversal -> TxKind.REVERSAL; refund -> TxKind.REFUND; else -> null },
            counterparty = name,
            upiRef = Text.upiRef(s),
            txnId = Text.txnId(s),
            accountHint = Text.account(s),
            bankName = bank,
            availableBalancePaise = Text.balance(s),
            appName = bank ?: smsAppName,
            sourcePackage = packageName,
            sourceType = SourceType.BANK_SMS_NOTIFICATION,
            occurredAt = n.postedAt,
            confidence = (70 + (if (Text.upiRef(s) != null) 20 else 0) + (if (bank != null) 5 else 0)).coerceAtMost(100),
        )
    }
}

/** A supported source app. */
data class SourceApp(val packageName: String, val name: String, val kind: Kind, val parser: NotificationParser) {
    enum class Kind { UPI_APP, SMS_APP }
}

/** Configurable registry of supported payment and SMS apps. Add a line here to support a new app. */
object PaymentAppRegistry {
    private fun upi(pkg: String, name: String, sent: List<Regex> = emptyList(), recv: List<Regex> = emptyList()) =
        SourceApp(pkg, name, SourceApp.Kind.UPI_APP, UpiAppParser(name, pkg, sent, recv))
    private fun sms(pkg: String, name: String) = SourceApp(pkg, name, SourceApp.Kind.SMS_APP, BankSmsParser(name, pkg))

    val apps: List<SourceApp> = listOf(
        upi("net.one97.paytm", "Paytm",
            sent = listOf(Regex("""Paid\s+(?:₹|Rs\.?)\s*[0-9,.]+\s+to\s+([^\n]+?)(?=\s+(?:from|using|via)\b|[.\n]|$)""", RegexOption.IGNORE_CASE)),
            recv = listOf(Regex("""Received\s+(?:₹|Rs\.?)\s*[0-9,.]+\s+from\s+([^\n]+?)(?=\s+(?:in|on|to|via)\b|[.\n]|$)""", RegexOption.IGNORE_CASE))),
        upi("com.google.android.apps.nbu.paisa.user", "Google Pay",
            recv = listOf(Regex("""^([^\n]+?)\s+paid\s+you""", RegexOption.IGNORE_CASE))),
        upi("com.phonepe.app", "PhonePe",
            sent = listOf(Regex("""(?:Paid|Sent)\s+(?:₹|Rs\.?)\s*[0-9,.]+\s+to\s+([^\n]+?)(?=\s+(?:from|using|via|successfully)\b|[.\n]|$)""", RegexOption.IGNORE_CASE))),
        upi("in.org.npci.upiapp", "BHIM"),
        upi("in.amazon.mShop.android.shopping", "Amazon Pay",
       sent = listOf(Regex("""(?:Paid|Sent)\s+(?:₹|Rs\.?)\s*[0-9,.]+\s+to\s+([^\n]+?)(?=\s+(?:via|using|from|on|with)\b|[.\n]|$)""", RegexOption.IGNORE_CASE)),
         recv = listOf(Regex("""(?:Received|Got)\s+(?:₹|Rs\.?)\s*[0-9,.]+\s+from\s+([^\n]+?)(?=\s+(?:in|on|via|to)\b|[.\n]|$)""", RegexOption.IGNORE_CASE))  ),    
        upi("com.dreamplug.androidapp", "CRED"),
        upi("com.mobikwik_new", "MobiKwik"),
        upi("money.super.payments", "super.money"),
        upi("com.fampay.in", "FamApp"),
        upi("com.naviapp", "Navi"),
        sms("com.google.android.apps.messaging", "Messages"),
        sms("com.android.mms", "Messages (Xiaomi/POCO)"),
        sms("com.samsung.android.messaging", "Samsung Messages"),
        sms("com.truecaller", "Truecaller SMS"),
        sms("com.oneplus.mms", "OnePlus Messages"),
    )
    private val byPkg = apps.associateBy { it.packageName }
    fun find(pkg: String): SourceApp? = byPkg[pkg]
    fun isSupported(pkg: String) = pkg in byPkg
}
