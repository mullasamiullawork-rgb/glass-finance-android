package com.samiulla.glassfinance.autotrack

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.samiulla.glassfinance.autotrack.core.*
import com.samiulla.glassfinance.autotrack.core.Fixtures as F
import com.samiulla.glassfinance.autotrack.data.AppStateEntity
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Room + repository on a real (Robolectric) Android runtime: persistence, restart, revoked access, offline. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RepositoryTest {
    private lateinit var ctx: Context

    @Before fun setUp() {
        ctx = ApplicationProvider.getApplicationContext()
        AutoTrackRepository.resetForTests()
        ctx.deleteDatabase("glass_finance.db")
        ctx.getSharedPreferences("autotrack", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @After fun tearDown() = AutoTrackRepository.resetForTests()

    private fun repo() = AutoTrackRepository.get(ctx)

    @Test fun t17_databasePersistence_and_t16_appRestart() {
        repo().process(F.paytmPaid)
        repo().process(F.sbiDebitSameRef)
        repo().db.dao().putState(AppStateEntity("ledger", "{\"schema\":2}", 1L))
        AutoTrackRepository.resetForTests() // process death / app restart
        val rows = repo().db.dao().all().map { it.toCore() }
        assertEquals(1, rows.size)
        assertEquals(Verification.CONFIRMED, rows[0].verification)
        assertEquals("{\"schema\":2}", repo().db.dao().state("ledger")!!.json)
    }

    @Test fun t15_permissionRevoked_isDetected() {
        // No listener access granted in this runtime: the status must report it as missing.
        assertFalse(repo().hasNotificationAccess())
    }

    @Test fun trackingOff_recordsNothing() {
        repo().enabled = false
        repo().handle(F.gpayPaid, "k1")
        repo().executor.submit {}.get()
        assertTrue(repo().db.dao().all().isEmpty())
    }

    @Test fun disabledApp_recordsNothing() {
        repo().disabledApps = setOf(F.PHONEPE)
        repo().handle(F.phonepePaid, "k2")
        repo().executor.submit {}.get()
        assertTrue(repo().db.dao().all().isEmpty())
    }

    @Test fun bankSmsSwitchOff_ignoresSmsApps() {
        repo().trackBankSms = false
        assertFalse(repo().isAppEnabled(F.SMS))
        assertTrue(repo().isAppEnabled(F.PAYTM))
    }

    @Test fun t18_offline_everythingLocal_andOtpNeverStored() {
        // No network is used anywhere in detection; an OTP message produces no record and only an outcome row with no text.
        repo().process(F.otp)
        assertTrue(repo().db.dao().all().isEmpty())
        val log = repo().db.dao().recentLog(5)
        assertEquals("IGNORED", log.first().outcome)
        assertFalse(log.first().reason!!.contains("OTP"))
    }

    @Test fun userCorrectionRemembered() {
        repo().process(F.n(F.PAYTM, "Paid ₹40 to Lakshmi Stores", "Paid ₹40 to Lakshmi Stores from SBI"))
        val dao = repo().db.dao()
        dao.putRule(com.samiulla.glassfinance.autotrack.data.MerchantRuleEntity(Categorizer.key("Lakshmi Stores"), "cat_groceries", 1))
        repo().process(F.n(F.PAYTM, "Paid ₹55 to Lakshmi Stores", "Paid ₹55 to Lakshmi Stores from SBI", F.T0 + 3_600_000))
        val second = dao.all().first { it.amountPaise == 5500L }
        assertEquals("cat_groceries", second.categoryId)
    }

    @Test fun t19_statementImportReconciles() {
        repo().process(F.gpayPaid)
        val r = repo().ingest(ParsedPayment(15000, Direction.DEBIT, TxStatus.SUCCESS, null, "HP PETROL", "532198765432", null, null, "SBI", 100000,
            "SBI", "statement", SourceType.STATEMENT_IMPORT, F.T0 + 7_200_000, 95))
        assertTrue(r is ReconcileResult.Updated)
        val rows = repo().db.dao().all()
        assertEquals(1, rows.size)
        assertEquals("BANK_VERIFIED", rows[0].verification)
    }
}
