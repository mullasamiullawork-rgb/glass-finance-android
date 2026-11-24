package com.samiulla.glassfinance.autotrack.core

/**
 * Sample notification texts modelled on the public formats of each app and bank alert.
 * These are TEST FIXTURES ONLY: invented names, amounts and references, never real user data.
 */
object Fixtures {
    const val PAYTM = "net.one97.paytm"
    const val GPAY = "com.google.android.apps.nbu.paisa.user"
    const val PHONEPE = "com.phonepe.app"
    const val BHIM = "in.org.npci.upiapp"
    const val AMAZON = "in.amazon.mShop.android.shopping"
    const val SMS = "com.google.android.apps.messaging"
    const val MIUI_SMS = "com.android.mms"

    const val T0 = 1_764_000_000_000L // fixed clock for tests

    fun n(pkg: String, title: String?, text: String, at: Long = T0) = RawNotification(pkg, title, text, null, null, at)

    val paytmPaid = n(PAYTM, "Paid ₹50 to Sri Sai Tea Stall", "Paid ₹50 to Sri Sai Tea Stall from State Bank of India - 4321. UPI Ref No: 432112345678")
    val gpayPaid = n(GPAY, "Payment successful", "You paid ₹150.00 to HP Petrol Pump Nandyal. UPI transaction ID: 532198765432")
    val phonepePaid = n(PHONEPE, "Sent ₹500 to Trends Fashion Store", "Payment successful. Paid from SBI a/c XX4321")
    val bhimPaid = n(BHIM, "Transaction Successful", "Rs. 240.00 sent to medplus pharmacy (medplus@ybl). UPI Ref no 612398745612")
    val amazonPaid = n(AMAZON, "Amazon Pay", "Payment of ₹299 to Jio Prepaid Recharge was successful")
    val gpayReceived = n(GPAY, "Ravi Kumar paid you ₹1,000", "Received in your SBI account. UPI Ref 732154698712")
    val paytmReceived = n(PAYTM, "Received ₹1,000 from Ravi Kumar", "Received ₹1,000 from Ravi Kumar in your State Bank of India a/c")
    val refund = n(PAYTM, "Refund received", "Refund of ₹250 from Ajio has been credited to your account. Ref No: 845612378945")
    val reversed = n(PHONEPE, "Payment reversed", "Your payment of ₹300 to Kirana Store has been reversed to your bank account. UPI Ref No 912345678123")
    val failed = n(GPAY, "Payment failed", "Your payment of ₹2,000 to Ramesh could not be completed. Any money debited will be refunded.")
    val pending = n(PHONEPE, "Payment pending", "Your payment of ₹800 to Coaching Centre is pending. We will update you shortly.")
    val pendingThenSuccess = n(PHONEPE, "Sent ₹800 to Coaching Centre", "Payment successful")
    val noMerchant = n(GPAY, "Payment successful", "You paid ₹75 UPI Ref 112233445566")
    val noRef = n(PAYTM, "Paid ₹60 to Annapurna Tiffins", "Paid ₹60 to Annapurna Tiffins from Paytm UPI")
    val selfTransfer = n(PHONEPE, "Self transfer successful", "₹2,000 transferred to your own account HDFC Bank XX9876")

    // Bank SMS as shown by the SMS app notification (sender as title).
    val sbiDebitSameRef = n(SMS, "SBIUPI", "Dear UPI user A/C X4321 debited by 50.0 on date 24Nov26 trf to SRI SAI TEA STALL Refno 432112345678. If not u? call 1800111109. -SBI")
    val sbiDebitNoRef = n(SMS, "SBIUPI", "Dear UPI user A/C X4321 debited by 60.0 on date 24Nov26 trf to ANNAPURNA TIFF. If not u? call 1800111109. -SBI", T0 + 45_000)
    val hdfcCredit = n(MIUI_SMS, "HDFCBK", "Rs.1000.00 credited to HDFC Bank A/c XX9876 on 24-11-26 by VPA ravi.kumar@okaxis (UPI 732154698712). Avl bal: Rs 12,345.50")
    val ippbDebit = n(SMS, "IPPBNK", "Your IPPB A/C XX1234 is debited for Rs. 500.00 on 24-11-2026 towards UPI/RRN 445566778899. Avl Bal Rs. 3,210.00")

    // Must be ignored.
    val otp = n(SMS, "AX-SBIOTP", "123456 is your OTP for transaction of Rs 500 at AMAZON. Do not share it with anyone. -SBI")
    val promo = n(PAYTM, "Cashback offer", "Win up to ₹500 cashback on your next recharge! Limited period offer.")
    val request = n(GPAY, "Payment request", "Ramesh has requested ₹200 from you")
    val unsupportedFormat = n(PHONEPE, "PhonePe", "Your KYC is complete. Enjoy PhonePe!")
    val chat = n(SMS, "Mom", "Come home by 7 and bring 2 kg tomatoes")
}
