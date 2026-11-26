package com.samiulla.glassfinance.autotrack.core

import com.samiulla.glassfinance.autotrack.core.Fixtures as F
import org.junit.Assert.*
import org.junit.Test

/** In-memory stand-in for the Room table, so reconciliation runs exactly as on device. */
class Ledger {
    val rows = linkedMapOf<String, DetectedTx>()
    private var seq = 0
    val r = Reconciler(clock = { F.T0 }, newId = { "t" + (++seq) })
    fun feed(n: RawNotification): ReconcileResult? {
        val p = PaymentAppRegistry.find(n.packageName)!!.parser.parse(n) ?: return null
        return feed(p)
    }
    fun feed(p: ParsedPayment): ReconcileResult {
        val res = r.reconcile(p, rows.values.toList(), Categorizer())
        when (res) {
            is ReconcileResult.Created -> rows[res.tx.id] = res.tx
            is ReconcileResult.Updated -> rows[res.tx.id] = res.tx
            is ReconcileResult.Duplicate -> {}
        }
        return res
    }
}

class ReconcilerTest {
    @Test fun t11_duplicateBankAndUpiNotifications_oneTransaction() {
        val l = Ledger()
        assertTrue(l.feed(F.paytmPaid) is ReconcileResult.Created)
        val r2 = l.feed(F.sbiDebitSameRef)
        assertTrue(r2 is ReconcileResult.Updated)
        assertEquals(1, l.rows.size)
        val t = l.rows.values.single()
        assertEquals(Verification.CONFIRMED, t.verification)
        assertEquals(setOf(SourceType.UPI_APP_NOTIFICATION, SourceType.BANK_SMS_NOTIFICATION), t.sources)
        assertEquals("Sri Sai Tea Stall", t.counterparty)
        assertEquals("cat_food", t.categoryId)
        // Same notification again → duplicate, still one row.
        assertTrue(l.feed(F.paytmPaid) is ReconcileResult.Duplicate)
        assertEquals(1, l.rows.size)
    }

    @Test fun crossSourceMatchWithoutReference() {
        val l = Ledger()
        l.feed(F.noRef)
        l.feed(F.sbiDebitNoRef) // "ANNAPURNA TIFF" truncated by the bank, 45 s later
        assertEquals(1, l.rows.size)
        assertEquals(Verification.CONFIRMED, l.rows.values.single().verification)
    }

    @Test fun twoLegitimateSameAmountPaymentsAreNotMerged() {
        val l = Ledger()
        l.feed(F.n(F.PAYTM, "Paid ₹20 to Tea Point", "Paid ₹20 to Tea Point from SBI", F.T0))
        l.feed(F.n(F.PAYTM, "Paid ₹20 to Tea Point", "Paid ₹20 to Tea Point from SBI ", F.T0 + 5 * 60_000))
        l.feed(F.n(F.PAYTM, "Paid ₹20 to Bus Stand Canteen", "Paid ₹20 to Bus Stand Canteen from SBI", F.T0 + 20_000))
        assertEquals(3, l.rows.size)
    }

    @Test fun differentReferencesNeverMerge() {
        val l = Ledger()
        l.feed(F.n(F.GPAY, "Payment successful", "You paid ₹100 to Shop A. UPI Ref 111111111111"))
        l.feed(F.n(F.SMS, "SBIUPI", "A/C X4321 debited by 100.0 trf to SHOP A Refno 222222222222 -SBI", F.T0 + 10_000))
        assertEquals(2, l.rows.size)
    }

    @Test fun t20_provisionalReconciledByBankStatement() {
        val l = Ledger()
        l.feed(F.gpayPaid)
        assertEquals(Verification.PROVISIONAL, l.rows.values.single().verification)
        val stmt = ParsedPayment(15000, Direction.DEBIT, TxStatus.SUCCESS, null, "HP PETROL PUMP", "532198765432", null, null, "SBI", null,
            "SBI", "statement", SourceType.STATEMENT_IMPORT, F.T0 + 3_600_000, 95)
        assertTrue(l.feed(stmt) is ReconcileResult.Updated)
        assertEquals(1, l.rows.size)
        assertEquals(Verification.BANK_VERIFIED, l.rows.values.single().verification)
    }

    @Test fun pendingUpgradedToSuccessInPlace() {
        val l = Ledger()
        l.feed(F.pending)
        val id = l.rows.keys.single()
        assertFalse(l.rows[id]!!.countsInLedger())
        l.feed(F.n(F.PHONEPE, F.pendingThenSuccess.title, F.pendingThenSuccess.text!!, F.T0 + 30_000))
        assertEquals(1, l.rows.size)
        assertEquals(TxStatus.SUCCESS, l.rows[id]!!.status)
        assertTrue(l.rows[id]!!.countsInLedger())
    }

    @Test fun failedPaymentNeverCountsInLedger() {
        val l = Ledger(); l.feed(F.failed)
        assertFalse(l.rows.values.single().countsInLedger())
    }

    @Test fun reversalOfKnownPaymentVoidsIt() {
        val l = Ledger()
        l.feed(F.n(F.PHONEPE, "Sent ₹300 to Kirana Store", "Payment successful. UPI Ref No 912345678123"))
        l.feed(F.reversed)
        assertEquals(1, l.rows.size)
        assertEquals(TxStatus.REVERSED, l.rows.values.single().status)
        assertFalse(l.rows.values.single().countsInLedger())
    }

    @Test fun standaloneReversalCountsAsCredit() {
        val l = Ledger(); l.feed(F.reversed)
        val t = l.rows.values.single()
        assertEquals(TxKind.REVERSAL, t.kind); assertTrue(t.countsInLedger())
    }

    @Test fun incomingIsNotAssumedEarnings() {
        val l = Ledger(); l.feed(F.gpayReceived); l.feed(F.hdfcCredit)
        val t = l.rows.values.single()
        assertEquals(TxKind.INCOME, t.kind); assertEquals("cat_received", t.categoryId)
    }

    @Test fun refundCategory() {
        val l = Ledger(); l.feed(F.refund)
        assertEquals("cat_refunds", l.rows.values.single().categoryId)
    }

    @Test fun idempotentReplayOfAllFixtures() {
        val l = Ledger()
        val all = listOf(F.paytmPaid, F.gpayPaid, F.phonepePaid, F.bhimPaid, F.gpayReceived, F.refund, F.sbiDebitSameRef, F.hdfcCredit)
        all.forEach { l.feed(it) }
        val n = l.rows.size
        all.forEach { l.feed(it) }
        assertEquals(n, l.rows.size)
    }
@Test fun deletedTransactionNotMatchedByStrongRef() {
    val r = Reconciler()
        val p1 = PaymentAppRegistry.find(F.paytmPaid.packageName)!!.parser.parse(F.paytmPaid)!!
        val p2 = PaymentAppRegistry.find(F.sbiDebitSameRef.packageName)!!.parser.parse(F.sbiDebitSameRef)!!
    val first = r.reconcile(p1, emptyList()) as ReconcileResult.Created
val deleted = first.tx.copy(deleted = true)
val second = r.reconcile(p2, listOf(deleted))
assertTrue(second is ReconcileResult.Created)
}
}

class CategorizerTest {
    private val c = Categorizer()
    @Test fun examplesFromSpec() {
        assertEquals("cat_food", c.categorize(TxKind.EXPENSE, "Tea Shop"))
        assertEquals("cat_transport", c.categorize(TxKind.EXPENSE, "Petrol Pump"))
        assertEquals("cat_shopping", c.categorize(TxKind.EXPENSE, "Shopping Store"))
        assertEquals("cat_groceries", c.categorize(TxKind.EXPENSE, "Ratnadeep Supermarket"))
        assertEquals("cat_health", c.categorize(TxKind.EXPENSE, "Apollo Pharmacy"))
        assertEquals("cat_bills", c.categorize(TxKind.EXPENSE, "Jio Prepaid Recharge"))
        assertEquals("cat_education", c.categorize(TxKind.EXPENSE, "Govt Junior College Fees"))
        assertEquals("cat_other", c.categorize(TxKind.EXPENSE, "Mr X"))
    }
    @Test fun userCorrectionWins() {
        val u = Categorizer(mapOf(Categorizer.key("Sri Sai Tea Stall") to "cat_groceries"))
        assertEquals("cat_groceries", u.categorize(TxKind.EXPENSE, "SRI SAI TEA STALL"))
    }
}
