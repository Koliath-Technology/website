"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCareer = createCareer;
exports.upsertGlobalUser = upsertGlobalUser;
exports.getGlobalUserById = getGlobalUserById;
exports.getGlobalUserByGoogleSub = getGlobalUserByGoogleSub;
exports.getDashboardForUser = getDashboardForUser;
exports.linkAppAccount = linkAppAccount;
exports.registerReferralCode = registerReferralCode;
exports.userOwnsCode = userOwnsCode;
exports.getReferralStats = getReferralStats;
exports.getAllRewards = getAllRewards;
exports.createRedemption = createRedemption;
exports.createReferralEvent = createReferralEvent;
exports.qualifyReferral = qualifyReferral;
exports.trackReferralEvent = trackReferralEvent;
exports.validateReferralCode = validateReferralCode;
const crypto_1 = require("crypto");
const pg_1 = require("pg");
const types_1 = require("./types/types");
const config_1 = require("./config");
const rules_1 = require("./rules");
/**
 * Railway's public proxy presents a certificate Node does not trust.
 * `pg` also lets `sslmode` in the URL overwrite an `ssl` option, so strip it
 * and set `rejectUnauthorized: false` for any non-local database.
 * Local Postgres stays without SSL. A missing DATABASE_URL still fails in production.
 */
function databasePoolConfig(databaseUrl) {
    var _a, _b;
    let host = "";
    try {
        host = new URL(databaseUrl).hostname;
    }
    catch (_c) {
        host = (_b = (_a = databaseUrl.match(/@([^/:?#]+)/)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : "";
    }
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const sslDisabled = /[?&]sslmode=disable(?:&|$)/.test(databaseUrl);
    if (local || sslDisabled) {
        return { connectionString: databaseUrl };
    }
    const connectionString = databaseUrl
        .replace(/([?&])sslmode=[^&]*&/g, "$1")
        .replace(/([?&])sslmode=[^&]*$/g, "");
    return { connectionString, ssl: { rejectUnauthorized: false } };
}
const pool = new pg_1.Pool(Object.assign(Object.assign({}, databasePoolConfig(config_1.config.databaseUrl)), { max: 10 }));
function mintGlobalCode() {
    return `KL-${(0, crypto_1.randomBytes)(3).toString("hex").toUpperCase()}`;
}
function createTable() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS careers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(30) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                contact BIGINT NOT NULL,
                linkedin VARCHAR(255) NOT NULL
            );
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS global_users (
                id SERIAL PRIMARY KEY,
                google_sub VARCHAR(64) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                display_name VARCHAR(255) NOT NULL,
                picture_url TEXT,
                global_code VARCHAR(20) NOT NULL UNIQUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_login_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS app_account_links (
                id SERIAL PRIMARY KEY,
                global_user_id INT NOT NULL REFERENCES global_users(id) ON DELETE CASCADE,
                source_app VARCHAR(32) NOT NULL,
                app_uid VARCHAR(128) NOT NULL,
                referral_code VARCHAR(20),
                linked_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (source_app, app_uid),
                UNIQUE (global_user_id, source_app)
            );
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS referral_codes (
                code VARCHAR(20) PRIMARY KEY,
                source_app VARCHAR(32) NOT NULL,
                global_user_id INT REFERENCES global_users(id) ON DELETE SET NULL,
                owner_email VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
            yield pool.query(`
            ALTER TABLE referral_codes
                ADD COLUMN IF NOT EXISTS global_user_id INT REFERENCES global_users(id) ON DELETE SET NULL;
        `);
            yield pool.query(`
            ALTER TABLE referral_codes
                ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS referral_events (
                id SERIAL PRIMARY KEY,
                referrer_code VARCHAR(20) NOT NULL,
                referred_email VARCHAR(255) NOT NULL,
                device_id VARCHAR(255),
                source_app VARCHAR(32) DEFAULT 'diabetic',
                points_awarded INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                confirmed_at TIMESTAMPTZ,
                UNIQUE (referred_email, source_app),
                UNIQUE (device_id, source_app)
            );
        `);
            // Soft-migrate legacy unique constraints if present
            try {
                yield pool.query(`ALTER TABLE referral_events DROP CONSTRAINT IF EXISTS referral_events_referred_email_key`);
                yield pool.query(`ALTER TABLE referral_events DROP CONSTRAINT IF EXISTS referral_events_device_id_key`);
            }
            catch (_a) {
                /* ignore */
            }
            yield pool.query(`
            ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS referral_tracking_events (
                id SERIAL PRIMARY KEY,
                referrer_code VARCHAR(20) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                device_id VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS referral_rewards (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL UNIQUE,
                required_referrals INT DEFAULT 0,
                points_cost INT NOT NULL DEFAULT 500,
                category VARCHAR(100) NOT NULL
            );
        `);
            yield pool.query(`
            ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS points_cost INT NOT NULL DEFAULT 500;
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS referral_balances (
                referrer_code VARCHAR(20) PRIMARY KEY,
                points_earned INT NOT NULL DEFAULT 0,
                points_spent INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
            yield pool.query(`
            CREATE TABLE IF NOT EXISTS reward_redemptions (
                id SERIAL PRIMARY KEY,
                referrer_code VARCHAR(20) NOT NULL,
                reward_id INT REFERENCES referral_rewards(id),
                contact_email VARCHAR(255) NOT NULL,
                points_spent INT NOT NULL DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending',
                requested_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
            yield pool.query(`
            ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS points_spent INT NOT NULL DEFAULT 0;
        `);
            yield pool.query(`
            INSERT INTO referral_rewards (title, required_referrals, points_cost, category) VALUES
                ('$10 Amazon Voucher', 0, 500, 'Shopping'),
                ('$25 Amazon Voucher', 0, 1200, 'Shopping'),
                ('1 Year Premium App', 0, 300, 'Subscription'),
                ('₹500 Flipkart Voucher', 0, 800, 'Shopping'),
                ('Koliath Merchandise', 0, 1500, 'Merchandise')
            ON CONFLICT (title) DO UPDATE SET
                points_cost = EXCLUDED.points_cost,
                category = EXCLUDED.category;
        `);
            console.log("Tables ready");
        }
        catch (e) {
            console.error("Error creating tables:", e);
        }
    });
}
void createTable();
function createCareer(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const validated = types_1.careersSchema.parse(data);
        const result = yield pool.query(`INSERT INTO careers (name, email, contact, linkedin)
         VALUES ($1, $2, $3, $4) RETURNING *`, [validated.name, validated.email, validated.contact, validated.linkedin]);
        return result.rows[0];
    });
}
function upsertGlobalUser(auth) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const existing = yield pool.query(`SELECT * FROM global_users WHERE google_sub = $1 OR email = $2 LIMIT 1`, [auth.googleSub, auth.email]);
        if (existing.rows[0]) {
            const row = existing.rows[0];
            yield pool.query(`UPDATE global_users
             SET display_name = $1, picture_url = $2, last_login_at = NOW(), google_sub = $3
             WHERE id = $4`, [auth.name, (_a = auth.picture) !== null && _a !== void 0 ? _a : null, auth.googleSub, row.id]);
            yield claimCodesForUser(row.id, auth.email);
            return getGlobalUserById(row.id);
        }
        let code = mintGlobalCode();
        for (let i = 0; i < 5; i++) {
            try {
                const inserted = yield pool.query(`INSERT INTO global_users (google_sub, email, display_name, picture_url, global_code)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`, [auth.googleSub, auth.email, auth.name, (_b = auth.picture) !== null && _b !== void 0 ? _b : null, code]);
                const user = inserted.rows[0];
                yield registerReferralCode(user.global_code, "global", user.id, user.email);
                yield claimCodesForUser(user.id, user.email);
                return user;
            }
            catch (e) {
                const err = e;
                if (err.code === "23505") {
                    code = mintGlobalCode();
                    continue;
                }
                throw e;
            }
        }
        throw new Error("Failed to mint unique global referral code");
    });
}
function claimCodesForUser(globalUserId, email) {
    return __awaiter(this, void 0, void 0, function* () {
        yield pool.query(`UPDATE referral_codes
         SET global_user_id = $1
         WHERE owner_email = $2 AND (global_user_id IS NULL OR global_user_id = $1)`, [globalUserId, email.toLowerCase()]);
    });
}
function getGlobalUserById(id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const result = yield pool.query(`SELECT * FROM global_users WHERE id = $1`, [id]);
        return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function getGlobalUserByGoogleSub(googleSub) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const result = yield pool.query(`SELECT * FROM global_users WHERE google_sub = $1`, [googleSub]);
        return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function getDashboardForUser(globalUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield getGlobalUserById(globalUserId);
        if (!user)
            return null;
        const codes = yield pool.query(`SELECT code, source_app AS "sourceApp", created_at AS "createdAt"
         FROM referral_codes
         WHERE global_user_id = $1 OR owner_email = $2 OR code = $3
         ORDER BY created_at ASC`, [globalUserId, user.email, user.global_code]);
        const codeList = codes.rows.map((r) => r.code);
        if (!codeList.includes(user.global_code)) {
            codeList.push(user.global_code);
        }
        let pointsEarned = 0;
        let pointsSpent = 0;
        let totalReferrals = 0;
        let pendingReferrals = 0;
        let confirmedReferrals = 0;
        if (codeList.length > 0) {
            const balance = yield pool.query(`SELECT COALESCE(SUM(points_earned), 0) AS earned, COALESCE(SUM(points_spent), 0) AS spent
             FROM referral_balances WHERE referrer_code = ANY($1)`, [codeList]);
            pointsEarned = parseInt(balance.rows[0].earned, 10) || 0;
            pointsSpent = parseInt(balance.rows[0].spent, 10) || 0;
            const counts = yield pool.query(`SELECT status, COUNT(*)::int AS count
             FROM referral_events WHERE referrer_code = ANY($1)
             GROUP BY status`, [codeList]);
            for (const row of counts.rows) {
                totalReferrals += row.count;
                if (row.status === "pending")
                    pendingReferrals += row.count;
                if (row.status === "confirmed")
                    confirmedReferrals += row.count;
            }
        }
        const links = yield pool.query(`SELECT source_app AS "sourceApp", app_uid AS "appUid", referral_code AS "referralCode", linked_at AS "linkedAt"
         FROM app_account_links WHERE global_user_id = $1`, [globalUserId]);
        const history = yield pool.query(`SELECT id, referrer_code AS "referrerCode", created_at AS "referredAt", status,
                points_awarded AS "pointsAwarded", source_app AS "sourceApp", confirmed_at AS "confirmedAt"
         FROM referral_events
         WHERE referrer_code = ANY($1)
         ORDER BY created_at DESC
         LIMIT 50`, [codeList]);
        const redemptions = yield pool.query(`SELECT status, COUNT(*)::int AS count FROM reward_redemptions
         WHERE referrer_code = ANY($1) GROUP BY status`, [codeList]);
        let pendingRewards = 0;
        let redeemedRewards = 0;
        for (const row of redemptions.rows) {
            if (row.status === "pending")
                pendingRewards += row.count;
            if (row.status === "fulfilled")
                redeemedRewards += row.count;
        }
        return {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            pictureUrl: user.picture_url,
            globalCode: user.global_code,
            codes: codes.rows,
            linkedApps: links.rows,
            pointsEarned,
            pointsSpent,
            pointsAvailable: Math.max(0, pointsEarned - pointsSpent),
            totalReferrals,
            pendingReferrals,
            confirmedReferrals,
            pendingRewards,
            redeemedRewards,
            referralHistory: history.rows,
        };
    });
}
function linkAppAccount(globalUserId, sourceApp, appUid, referralCode) {
    return __awaiter(this, void 0, void 0, function* () {
        yield pool.query(`INSERT INTO app_account_links (global_user_id, source_app, app_uid, referral_code)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (global_user_id, source_app) DO UPDATE SET
            app_uid = EXCLUDED.app_uid,
            referral_code = COALESCE(EXCLUDED.referral_code, app_account_links.referral_code),
            linked_at = NOW()`, [globalUserId, sourceApp, appUid, referralCode !== null && referralCode !== void 0 ? referralCode : null]);
        if (referralCode) {
            const user = yield getGlobalUserById(globalUserId);
            yield registerReferralCode(referralCode, sourceApp, globalUserId, user === null || user === void 0 ? void 0 : user.email);
        }
        return getDashboardForUser(globalUserId);
    });
}
function registerReferralCode(code, sourceApp, globalUserId, ownerEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const normalized = code.trim().toUpperCase();
        yield pool.query(`INSERT INTO referral_codes (code, source_app, global_user_id, owner_email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
            source_app = EXCLUDED.source_app,
            global_user_id = COALESCE(EXCLUDED.global_user_id, referral_codes.global_user_id),
            owner_email = COALESCE(EXCLUDED.owner_email, referral_codes.owner_email)`, [normalized, sourceApp, globalUserId !== null && globalUserId !== void 0 ? globalUserId : null, (_a = ownerEmail === null || ownerEmail === void 0 ? void 0 : ownerEmail.toLowerCase()) !== null && _a !== void 0 ? _a : null]);
        yield pool.query(`INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
         VALUES ($1, 0, 0)
         ON CONFLICT (referrer_code) DO NOTHING`, [normalized]);
        return { code: normalized, sourceApp };
    });
}
function userOwnsCode(globalUserId, code) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalized = code.trim().toUpperCase();
        const user = yield getGlobalUserById(globalUserId);
        if (!user)
            return false;
        if (user.global_code === normalized)
            return true;
        const row = yield pool.query(`SELECT 1 FROM referral_codes
         WHERE code = $1 AND (global_user_id = $2 OR owner_email = $3)
         LIMIT 1`, [normalized, globalUserId, user.email]);
        return row.rows.length > 0;
    });
}
function getReferralStats(code) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const normalized = code.trim().toUpperCase();
        const codeRow = yield pool.query("SELECT code, source_app FROM referral_codes WHERE code = $1", [normalized]);
        const balanceRow = yield pool.query("SELECT points_earned, points_spent FROM referral_balances WHERE referrer_code = $1", [normalized]);
        const totalQuery = yield pool.query("SELECT COUNT(*) FROM referral_events WHERE referrer_code = $1", [normalized]);
        const totalReferrals = parseInt(totalQuery.rows[0].count, 10) || 0;
        let pointsEarned = balanceRow.rows[0]
            ? parseInt(balanceRow.rows[0].points_earned, 10) || 0
            : 0;
        let pointsSpent = balanceRow.rows[0]
            ? parseInt(balanceRow.rows[0].points_spent, 10) || 0
            : 0;
        if (!balanceRow.rows[0] && totalReferrals > 0) {
            const pts = yield pool.query(`SELECT COALESCE(SUM(points_awarded), 0) AS earned FROM referral_events
             WHERE referrer_code = $1 AND status = 'confirmed'`, [normalized]);
            pointsEarned = parseInt(pts.rows[0].earned, 10) || 0;
        }
        const redemptionsQuery = yield pool.query("SELECT status, COUNT(*) FROM reward_redemptions WHERE referrer_code = $1 GROUP BY status", [normalized]);
        let pendingRewards = 0;
        let redeemedRewards = 0;
        for (const row of redemptionsQuery.rows) {
            if (row.status === "pending")
                pendingRewards += parseInt(row.count, 10);
            if (row.status === "fulfilled")
                redeemedRewards += parseInt(row.count, 10);
        }
        const historyQuery = yield pool.query(`SELECT id, created_at as "referredAt", status, points_awarded as "pointsAwarded", source_app as "sourceApp"
         FROM referral_events WHERE referrer_code = $1 ORDER BY created_at DESC`, [normalized]);
        const exists = codeRow.rows.length > 0 || totalReferrals > 0 || balanceRow.rows.length > 0;
        return {
            code: normalized,
            exists,
            sourceApp: (_b = (_a = codeRow.rows[0]) === null || _a === void 0 ? void 0 : _a.source_app) !== null && _b !== void 0 ? _b : null,
            totalReferrals,
            pointsEarned,
            pointsSpent,
            pointsAvailable: Math.max(0, pointsEarned - pointsSpent),
            pendingRewards,
            redeemedRewards,
            referralHistory: historyQuery.rows,
        };
    });
}
function getAllRewards() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield pool.query("SELECT id, title, points_cost, category, required_referrals FROM referral_rewards ORDER BY points_cost ASC");
        return result.rows;
    });
}
function createRedemption(code, rewardId, contactEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalized = code.trim().toUpperCase();
        const client = yield pool.connect();
        try {
            yield client.query("BEGIN");
            const rewardResult = yield client.query("SELECT id, points_cost, title FROM referral_rewards WHERE id = $1 FOR SHARE", [rewardId]);
            if (rewardResult.rows.length === 0) {
                throw Object.assign(new Error("Reward not found"), { status: 404 });
            }
            const reward = rewardResult.rows[0];
            const cost = parseInt(reward.points_cost, 10);
            yield client.query(`INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
             VALUES ($1, 0, 0) ON CONFLICT (referrer_code) DO NOTHING`, [normalized]);
            const balanceResult = yield client.query("SELECT points_earned, points_spent FROM referral_balances WHERE referrer_code = $1 FOR UPDATE", [normalized]);
            const earned = parseInt(balanceResult.rows[0].points_earned, 10) || 0;
            const spent = parseInt(balanceResult.rows[0].points_spent, 10) || 0;
            const available = earned - spent;
            if (available < cost) {
                throw Object.assign(new Error(`Not enough points. Need ${cost}, have ${available}.`), { status: 400 });
            }
            yield client.query("UPDATE referral_balances SET points_spent = points_spent + $1, updated_at = NOW() WHERE referrer_code = $2", [cost, normalized]);
            const redemption = yield client.query(`INSERT INTO reward_redemptions (referrer_code, reward_id, contact_email, points_spent)
             VALUES ($1, $2, $3, $4) RETURNING *`, [normalized, rewardId, contactEmail.toLowerCase(), cost]);
            yield client.query("COMMIT");
            return redemption.rows[0];
        }
        catch (e) {
            yield client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    });
}
/**
 * Creates a pending or immediately confirmed referral depending on app rules.
 * For diabetic (confirmOn: signup), awards points immediately.
 */
function createReferralEvent(referrerCode_1, referredEmail_1, deviceId_1) {
    return __awaiter(this, arguments, void 0, function* (referrerCode, referredEmail, deviceId, sourceApp = "diabetic", pointsAwarded = config_1.POINTS_PER_REFERRAL) {
        if (!(0, rules_1.isSourceApp)(sourceApp)) {
            throw Object.assign(new Error("Unknown source app"), { status: 400 });
        }
        const rule = (0, rules_1.getRule)(sourceApp);
        const status = rule.confirmOn === "signup" ? "confirmed" : "pending";
        const awarded = status === "confirmed" ? rule.points : 0;
        return insertReferralEvent(referrerCode, referredEmail, deviceId, sourceApp, awarded, status);
    });
}
function insertReferralEvent(referrerCode, referredEmail, deviceId, sourceApp, pointsAwarded, status) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalized = referrerCode.trim().toUpperCase();
        const client = yield pool.connect();
        try {
            yield client.query("BEGIN");
            const codeCheck = yield client.query("SELECT code FROM referral_codes WHERE code = $1", [normalized]);
            if (codeCheck.rows.length === 0) {
                throw Object.assign(new Error("Unknown referral code"), {
                    status: 404,
                    code: "UNKNOWN_CODE",
                });
            }
            const event = yield client.query(`INSERT INTO referral_events
                (referrer_code, referred_email, device_id, source_app, points_awarded, status, confirmed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [
                normalized,
                referredEmail.toLowerCase(),
                deviceId,
                sourceApp,
                pointsAwarded,
                status,
                status === "confirmed" ? new Date() : null,
            ]);
            if (status === "confirmed" && pointsAwarded > 0) {
                yield client.query(`INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
                 VALUES ($1, $2, 0)
                 ON CONFLICT (referrer_code) DO UPDATE SET
                    points_earned = referral_balances.points_earned + $2,
                    updated_at = NOW()`, [normalized, pointsAwarded]);
            }
            yield client.query("COMMIT");
            return event.rows[0];
        }
        catch (e) {
            yield client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    });
}
/**
 * Trusted apps call this when a referred user meets the qualification event
 * (e.g. Sapient day_active, Adverts purchase).
 */
function qualifyReferral(referrerCode, referredEmail, deviceId, sourceApp, event) {
    return __awaiter(this, void 0, void 0, function* () {
        const rule = (0, rules_1.getRule)(sourceApp);
        const normalized = referrerCode.trim().toUpperCase();
        const email = referredEmail.toLowerCase();
        if (event === "signup" && rule.trackPendingOnSignup) {
            // Create pending (or confirmed for diabetic)
            try {
                return yield createReferralEvent(normalized, email, deviceId, sourceApp);
            }
            catch (e) {
                const err = e;
                if (err.code === "23505") {
                    // already tracked — fall through to possible confirmation
                }
                else {
                    throw e;
                }
            }
        }
        if (event !== rule.confirmOn && !(event === "signup" && rule.confirmOn === "signup")) {
            return {
                success: true,
                status: "ignored",
                message: `Event '${event}' does not confirm rewards for ${rule.label}. Waiting for '${rule.confirmOn}'.`,
            };
        }
        const client = yield pool.connect();
        try {
            yield client.query("BEGIN");
            let existing = yield client.query(`SELECT * FROM referral_events
             WHERE referrer_code = $1 AND referred_email = $2 AND source_app = $3
             FOR UPDATE`, [normalized, email, sourceApp]);
            if (existing.rows.length === 0) {
                existing = yield client.query(`SELECT * FROM referral_events
                 WHERE referrer_code = $1 AND device_id = $2 AND source_app = $3
                 FOR UPDATE`, [normalized, deviceId, sourceApp]);
            }
            if (existing.rows.length === 0) {
                // First time seeing this qualification — insert confirmed
                const inserted = yield client.query(`INSERT INTO referral_events
                    (referrer_code, referred_email, device_id, source_app, points_awarded, status, confirmed_at)
                 VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW()) RETURNING *`, [normalized, email, deviceId, sourceApp, rule.points]);
                yield client.query(`INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
                 VALUES ($1, $2, 0)
                 ON CONFLICT (referrer_code) DO UPDATE SET
                    points_earned = referral_balances.points_earned + $2,
                    updated_at = NOW()`, [normalized, rule.points]);
                yield client.query("COMMIT");
                return { success: true, status: "confirmed", pointsAwarded: rule.points, event: inserted.rows[0] };
            }
            const row = existing.rows[0];
            if (row.status === "confirmed") {
                yield client.query("COMMIT");
                return { success: true, status: "already_confirmed", pointsAwarded: 0 };
            }
            yield client.query(`UPDATE referral_events
             SET status = 'confirmed', points_awarded = $1, confirmed_at = NOW()
             WHERE id = $2`, [rule.points, row.id]);
            yield client.query(`INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
             VALUES ($1, $2, 0)
             ON CONFLICT (referrer_code) DO UPDATE SET
                points_earned = referral_balances.points_earned + $2,
                updated_at = NOW()`, [normalized, rule.points]);
            yield client.query("COMMIT");
            return { success: true, status: "confirmed", pointsAwarded: rule.points };
        }
        catch (e) {
            yield client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    });
}
function trackReferralEvent(code, eventType, deviceId, ipAddress, userAgent) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalized = code.trim().toUpperCase();
        const recentEvent = yield pool.query(`SELECT id FROM referral_tracking_events
         WHERE referrer_code = $1 AND event_type = $2 AND device_id = $3
           AND created_at > NOW() - INTERVAL '1 hour'`, [normalized, eventType, deviceId]);
        if (recentEvent.rows.length === 0) {
            yield pool.query(`INSERT INTO referral_tracking_events (referrer_code, event_type, device_id, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`, [normalized, eventType, deviceId, ipAddress !== null && ipAddress !== void 0 ? ipAddress : null, userAgent !== null && userAgent !== void 0 ? userAgent : null]);
        }
    });
}
function validateReferralCode(code) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalized = code.trim().toUpperCase();
        if (!/^[A-Z]{2}-[A-Z0-9]{4,12}$|^[A-Z0-9]{4,12}$/.test(normalized)) {
            return false;
        }
        const result = yield pool.query("SELECT code FROM referral_codes WHERE code = $1", [normalized]);
        return result.rows.length > 0;
    });
}
