import assert from "node:assert/strict"
import test from "node:test"
import { isAdminSubject } from "./guard"

const allowlist = ["google-sub-1", "firebase-uid-1"]

test("isAdminSubject matches a Google subject or a Firebase uid", () => {
    assert.equal(
        isAdminSubject({ googleSub: "google-sub-1", firebaseUid: "other-uid" }, allowlist),
        true
    )
    assert.equal(
        isAdminSubject({ googleSub: "other-sub", firebaseUid: "firebase-uid-1" }, allowlist),
        true
    )
    assert.equal(
        isAdminSubject({ googleSub: "google-sub-1", firebaseUid: "firebase-uid-1" }, allowlist),
        true
    )
    assert.equal(isAdminSubject({ firebaseUid: "firebase-uid-1" }, allowlist), true)
    assert.equal(isAdminSubject({ googleSub: "google-sub-1" }, allowlist), true)
})

test("isAdminSubject fails closed for an empty allowlist or a missing subject", () => {
    const user = { googleSub: "google-sub-1", firebaseUid: "firebase-uid-1" }
    assert.equal(isAdminSubject(user, []), false)
    assert.equal(isAdminSubject({ googleSub: "other", firebaseUid: "other" }, allowlist), false)
    assert.equal(isAdminSubject(undefined, allowlist), false)
    assert.equal(isAdminSubject(null, allowlist), false)
    assert.equal(isAdminSubject({ googleSub: "", firebaseUid: "" }, [""]), false)
    assert.equal(isAdminSubject({ googleSub: "", firebaseUid: "firebase-uid-1" }, allowlist), true)
    assert.equal(isAdminSubject({ googleSub: "google-sub", firebaseUid: "firebase-uid" }, allowlist), false)
})
