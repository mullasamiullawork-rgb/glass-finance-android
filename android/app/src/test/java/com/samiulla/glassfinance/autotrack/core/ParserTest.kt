package com.samiulla.glassfinance.autotrack.core

import com.samiulla.glassfinance.autotrack.core.Fixtures as F
import org.junit.Assert.*
import org.junit.Test

class ParserTest {
    private fun parse(n: RawNotification) = PaymentAppRegistry.find(n.packageName)!!.parser.parse(n)

    @Test fun t01_paytmSuccessfulPayment() {
        val p = parse(F.paytmPaid)!!
        assertEquals(5000L, p.amountPaise); assertEquals(Direction.DEBIT, p.direction); assertEquals(TxStatus.SUCCESS, p.status)
        assertEquals("Sri Sai Tea Stall", p.counterparty); assertEquals("432112345678", p.upiRef); assertEquals("Paytm", p.appName)
    }
    @Test fun t02_googlePaySuccessfulPayment() {
        val p = parse(F.gpayPaid)!!
        assertEquals(15000L, p.amountPaise); assertEquals(Direction.DEBIT, p.direction); assertEquals("HP Petrol Pump Nandyal", p.counterparty); assertEquals("532198765432", p.upiRef)
    }
    @Test fun t03_phonePeSuccessfulPayment() {
        val p = parse(F.phonepePaid)!!
        assertEquals(50000L, p.amountPaise); assertEquals(Direction.DEBIT, p.direction); assertEquals("Trends Fashion Store", p.counterparty); assertEquals("4321", p.accountHint)
    }
    @Test fun t04_bhimSuccessfulPayment() {
        val p = parse(F.bhimPaid)!!
        assertEquals(24000L, p.amountPaise); assertEquals(Direction.DEBIT, p.direction); assertEquals("612398745612", p.upiRef)
        assertTrue(p.counterparty!!.lowercase().contains("medplus"))
    }
    @Test fun amazonPayPayment() {
        val p = parse(F.amazonPaid)!!
        assertEquals(29900L, p.amountPaise); assertEquals(Direction.DEBIT, p.direction); assertEquals("Jio Prepaid Recharge", p.counterparty)
    }
    @Test fun t05_incomingUpiPayment() {
        val p = parse(F.gpayReceived)!!
        assertEquals(100000L, p.amountPaise); assertEquals(Direction.CREDIT, p.direction); assertEquals("Ravi Kumar", p.counterparty)
        assertEquals(TxKind.INCOME, Classifier.kind(p))
        val q = parse(F.paytmReceived)!!
        assertEquals(Direction.CREDIT, q.direction); assertEquals("Ravi Kumar", q.counterparty)
    }
    @Test fun t06_outgoingUpiPayment_classifiedAsExpense() {
        assertEquals(TxKind.EXPENSE, Classifier.kind(parse(F.paytmPaid)!!))
    }
    @Test fun t07_refund() {
        val p = parse(F.refund)!!
        assertEquals(25000L, p.amountPaise); assertEquals(Direction.CREDIT, p.direction); assertEquals(TxKind.REFUND, Classifier.kind(p))
    }
    @Test fun t08_reversedPayment() {
        val p = parse(F.reversed)!!
        assertEquals(TxStatus.REVERSED, p.status); assertEquals(TxKind.REVERSAL, Classifier.kind(p)); assertEquals(Direction.CREDIT, p.direction)
    }
    @Test fun t09_failedPayment() {
        val p = parse(F.failed)!!
        assertEquals(TxStatus.FAILED, p.status); assertEquals(200000L, p.amountPaise)
    }
    @Test fun t10_pendingPayment() {
        val p = parse(F.pending)!!
        assertEquals(TxStatus.PENDING, p.status); assertEquals(80000L, p.amountPaise)
    }
    @Test fun t12_missingMerchant() {
        val p = parse(F.noMerchant)!!
        assertEquals(7500L, p.amountPaise); assertNull(p.counterparty); assertEquals("112233445566", p.upiRef)
    }
    @Test fun t13_missingReference() {
        val p = parse(F.noRef)!!
        assertNull(p.upiRef); assertEquals("Annapurna Tiffins", p.counterparty)
    }
    @Test fun t14_unsupportedFormatIgnored() {
        assertNull(parse(F.unsupportedFormat))
    }
    @Test fun selfTransferIsTransfer() {
        assertEquals(TxKind.TRANSFER, Classifier.kind(parse(F.selfTransfer)!!))
    }
    @Test fun bankSms_debitCreditBalanceBank() {
        val d = parse(F.sbiDebitSameRef)!!
        assertEquals(5000L, d.amountPaise); assertEquals(Direction.DEBIT, d.direction); assertEquals("SBI", d.bankName)
        assertEquals("432112345678", d.upiRef); assertEquals(SourceType.BANK_SMS_NOTIFICATION, d.sourceType)
        val c = parse(F.hdfcCredit)!!
        assertEquals(100000L, c.amountPaise); assertEquals(Direction.CREDIT, c.direction); assertEquals("HDFC Bank", c.bankName)
        assertEquals(1234550L, c.availableBalancePaise); assertEquals("732154698712", c.upiRef)
        val i = parse(F.ippbDebit)!!
        assertEquals(50000L, i.amountPaise); assertEquals("India Post Payments Bank", i.bankName); assertEquals(321000L, i.availableBalancePaise); assertEquals("445566778899", i.upiRef)
    }
    @Test fun privacy_otpPromoRequestChatIgnored() {
        assertNull(parse(F.otp)); assertNull(parse(F.promo)); assertNull(parse(F.request)); assertNull(parse(F.chat))
    }
    @Test fun unrelatedAppsAreNotSupported() {
        assertFalse(PaymentAppRegistry.isSupported("com.whatsapp"))
        assertFalse(PaymentAppRegistry.isSupported("com.instagram.android"))
    }
    @Test fun indianAmountFormats() {
        assertEquals(15000000L, Text.amount("Paid Rs 1,50,000 to X"))
        assertEquals(125050L, Text.amount("₹1,250.50 sent"))
        assertEquals(50000L, Text.amount("INR 500 debited"))
    }
@Test fun additionalIndianBanksAndSpentSms() {
    val idfc = parse(RawNotification("com.google.android.apps.messaging", "IDFC", "Rs.350.00 spent on IDFC First Bank Card xx1234 at Swiggy on 26-11-26. UPI Ref 987654321012.", null, null, 1_700_000_000_000L))!!
assertEquals(35000L, idfc.amountPaise)
assertEquals(Direction.DEBIT, idfc.direction)
assertEquals("IDFC First Bank", idfc.bankName)
assertEquals("987654321012", idfc.upiRef)

val yes = parse(RawNotification("com.android.mms", "YESBANK", "INR 1,200.00 credited to Yes Bank A/c xx4321 from Rahul. Avl Bal INR 5,400.00", null, null, 1_700_000_000_000L))!!
assertEquals(120000L, yes.amountPaise)
assertEquals(Direction.CREDIT, yes.direction)
assertEquals("Yes Bank", yes.bankName)
assertEquals(540000L, yes.availableBalancePaise)
}
}
