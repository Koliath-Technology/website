import assert from "node:assert/strict"
import test from "node:test"
import { decideFraud, type FraudSignal } from "./rules"

function signal(partial: Partial<FraudSignal> & Pick<FraudSignal, "id" | "severity" | "effect">): FraudSignal {
    return {
        suggestedRisk: "REVIEW",
        ...partial,
    }
}

test("no signals grants the reward and stays NORMAL", () => {
    const decision = decideFraud([])
    assert.equal(decision.grantReward, true)
    assert.equal(decision.riskStatus, "NORMAL")
})

test("one low flag sets REVIEW and still grants, and cannot BLOCK", () => {
    const flagged = decideFraud([
        signal({ id: "device_many_accounts", severity: "low", effect: "flag", suggestedRisk: "REVIEW" }),
    ])
    assert.equal(flagged.grantReward, true)
    assert.equal(flagged.riskStatus, "REVIEW")

    const capped = decideFraud([
        signal({ id: "device_many_accounts", severity: "low", effect: "flag", suggestedRisk: "BLOCKED" }),
    ])
    assert.equal(capped.grantReward, true)
    assert.equal(capped.riskStatus, "REVIEW")
})

test("one medium deny marks REVIEW and does not BLOCK", () => {
    const decision = decideFraud([
        signal({
            id: "same_device_same_app_reward",
            severity: "medium",
            effect: "deny_reward",
            suggestedRisk: "BLOCKED",
        }),
    ])
    assert.equal(decision.grantReward, false)
    assert.equal(decision.riskStatus, "REVIEW")
})

test("one high many-account signal can BLOCK and deny the reward", () => {
    const decision = decideFraud([
        signal({
            id: "device_many_accounts",
            severity: "high",
            effect: "deny_reward",
            suggestedRisk: "BLOCKED",
        }),
    ])
    assert.equal(decision.grantReward, false)
    assert.equal(decision.riskStatus, "BLOCKED")
})

test("two low flag signals can raise REVIEW without blocking", () => {
    const decision = decideFraud([
        signal({ id: "device_many_accounts", severity: "low", effect: "flag", suggestedRisk: "REVIEW" }),
        signal({ id: "download_velocity", severity: "low", effect: "flag", suggestedRisk: "REVIEW" }),
    ])
    assert.equal(decision.grantReward, true)
    assert.equal(decision.riskStatus, "REVIEW")
})
