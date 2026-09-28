import assert from "node:assert/strict"
import test from "node:test"
import {
    assessGiftCard,
    publicReferralOutcome,
    readRewardProgram,
    signupReferralDecision,
    type SignupReferralSignals,
} from "./program"

const baseSignals = (): SignupReferralSignals => ({
    referrerUserId: 1,
    referredUserId: 2,
    referrerEmail: "a@example.com",
    referredEmail: "b@example.com",
    referrerRisk: "NORMAL",
    referredRisk: "NORMAL",
    referrerAccount: "active",
    referredAccount: "active",
    mutualLoop: false,
    deviceSharedWithOtherUser: false,
    recentGranted: 0,
})

test("reward program defaults match the published coins", () => {
    const program = readRewardProgram({})
    assert.deepEqual(program, {
        firstLoginRewardCoins: 10,
        appDownloadRewardCoins: 25,
        referralRewardCoins: 20,
        giftCardCostCoins: 200,
        giftCardValueInr: 100,
        referralsRequiredForRedemption: 3,
        verificationTokenExpiryMinutes: 1440,
    })
})

test("reward program clamps garbage and keeps explicit zeros for coin rewards", () => {
    const program = readRewardProgram({
        FIRST_LOGIN_REWARD_COINS: "nope",
        APP_DOWNLOAD_REWARD_COINS: "25.9",
        REFERRAL_REWARD_COINS: "-4",
        GIFT_CARD_COST_COINS: "0",
        GIFT_CARD_VALUE_INR: "100",
        REFERRALS_REQUIRED_FOR_REDEMPTION: "3",
        VERIFICATION_TOKEN_EXPIRY_MINUTES: "99999",
    })
    assert.equal(program.firstLoginRewardCoins, 10)
    assert.equal(program.appDownloadRewardCoins, 25)
    assert.equal(program.referralRewardCoins, 0)
    assert.equal(program.giftCardCostCoins, 1)
    assert.equal(program.verificationTokenExpiryMinutes, 1440)
})

test("gift card stays locked until coins and valid referrals both clear", () => {
    const program = readRewardProgram({})
    const coinsShort = assessGiftCard({ pointsAvailable: 199, validReferrals: 3, program })
    assert.equal(coinsShort.eligible, false)
    assert.equal(coinsShort.coinsShort, 1)
    assert.equal(coinsShort.referralsShort, 0)

    const referralsShort = assessGiftCard({ pointsAvailable: 200, validReferrals: 2, program })
    assert.equal(referralsShort.eligible, false)
    assert.equal(referralsShort.referralsShort, 1)

    const ready = assessGiftCard({ pointsAvailable: 240, validReferrals: 4, program })
    assert.equal(ready.eligible, true)
    assert.equal(ready.costCoins, 200)
    assert.equal(ready.valueInr, 100)
})

test("signup referral blocks self, loops, shared devices, and velocity", () => {
    assert.equal(signupReferralDecision({ ...baseSignals(), referredUserId: 1 }).reason, "self_referral")
    assert.equal(
        signupReferralDecision({ ...baseSignals(), referredEmail: "A@example.com" }).reason,
        "self_referral"
    )
    assert.equal(signupReferralDecision({ ...baseSignals(), referrerRisk: "BLOCKED" }).reason, "blocked_account")
    assert.equal(signupReferralDecision({ ...baseSignals(), referredAccount: "suspended" }).reason, "blocked_account")
    assert.equal(signupReferralDecision({ ...baseSignals(), mutualLoop: true }).reason, "referral_loop")
    assert.equal(
        signupReferralDecision({ ...baseSignals(), deviceSharedWithOtherUser: true }).reason,
        "same_device"
    )
    assert.equal(signupReferralDecision({ ...baseSignals(), recentGranted: 8 }).reason, "velocity")
    assert.equal(signupReferralDecision({ ...baseSignals(), recentGranted: 7 }).reason, "ok")
    assert.equal(signupReferralDecision(baseSignals()).grant, true)
})

test("public referral outcome hides the fraud reason", () => {
    const body = publicReferralOutcome(signupReferralDecision({ ...baseSignals(), mutualLoop: true }))
    assert.deepEqual(body, { status: "rejected" })
    assert.equal(JSON.stringify(body).includes("referral_loop"), false)
    assert.equal("reason" in body, false)
})
