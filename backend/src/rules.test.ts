import assert from "node:assert/strict"
import test from "node:test"
import {
    APP_REFERRAL_RULES,
    REFERRALS_REQUIRED,
    REWARD_GATE_COPY,
    listPublicRules,
    pointsForQualifyingEvent,
    publicRewardRule,
    rewardsUnlocked,
    spendablePoints,
} from "./rules.ts"

test("points stay at zero until three referrals already exist", () => {
    assert.equal(pointsForQualifyingEvent(0, 100), 0)
    assert.equal(pointsForQualifyingEvent(2, 100), 0)
    assert.equal(pointsForQualifyingEvent(REFERRALS_REQUIRED, 100), 100)
    assert.equal(pointsForQualifyingEvent(4, 50), 50)
})

test("rewards stay locked before three referrals and points are not spendable", () => {
    assert.equal(rewardsUnlocked(2), false)
    assert.equal(rewardsUnlocked(3), true)
    assert.equal(spendablePoints(2, 300, 0), 0)
    assert.equal(spendablePoints(3, 300, 50), 250)
})

test("Sapient points require a completed profile and the referral gate", () => {
    const sapient = APP_REFERRAL_RULES.sapient
    assert.equal(sapient.confirmOn, "profile_completed")
    const line = publicRewardRule(sapient.label, sapient.useCheck)
    assert.match(line, /completes their profile/)
    assert.match(line, /three referrals/)
    assert.equal(REWARD_GATE_COPY.includes("three referrals"), true)
    assert.equal(REWARD_GATE_COPY.includes("locked"), true)
})

test("a listing without a use check does not invent one", () => {
    const line = publicRewardRule("Example", null)
    assert.match(line, /own use check/)
    assert.equal(line.includes("purchase"), false)
    assert.equal(line.includes("profile"), false)
})

test("every listed app publishes one plain-language rule", () => {
    const rules = listPublicRules()
    assert.equal(rules.length, 5)
    for (const rule of rules) {
        assert.equal(rule.description.includes("three referrals"), true)
        assert.equal(rule.points > 0, true)
    }
    const sapient = rules.find((rule) => rule.app === "sapient")
    assert.equal(sapient?.confirmOn, "profile_completed")
})
