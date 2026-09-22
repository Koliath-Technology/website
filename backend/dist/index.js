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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const zod_1 = require("zod");
const config_1 = require("./config");
const auth_1 = require("./auth");
const rules_1 = require("./rules");
const types_1 = require("./types/types");
const db_1 = require("./db");
const app = (0, express_1.default)();
app.set("trust proxy", 1);
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || config_1.config.corsOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: "32kb" }));
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(generalLimiter);
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: { success: false, message: "Too many auth attempts" },
});
const trackingLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: "Too many tracking requests" },
});
app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "koliath-rewards" });
});
app.get("/api/referral-rules", (_req, res) => {
    res.status(200).json({ rules: (0, rules_1.listPublicRules)() });
});
const contactLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: "Too many contact requests" },
});
/**
 * Accepts brochure / hub inquiries without a mailbox integration.
 * The process log is the dev inbox. Production should tail these logs or
 * forward them until an email provider is configured — no secrets required.
 */
app.post("/api/contact", contactLimiter, (req, res) => {
    const body = types_1.contactInquirySchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ success: false, message: "Check the form and try again." });
    }
    console.log(JSON.stringify(Object.assign({ type: "contact_inquiry", at: new Date().toISOString() }, body.data)));
    res.status(202).json({
        success: true,
        message: "Received. We will reply by email.",
    });
});
app.post("/careers", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = types_1.careersSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    const { name, email, contact, linkedin } = body.data;
    try {
        yield (0, db_1.createCareer)({ name, email, contact, linkedin });
    }
    catch (_a) {
        return res.status(500).json({
            msg: "Application already exists or database unavailable",
        });
    }
    res.status(200).json({
        msg: "Career application received successfully",
        data: { name, email, contact, linkedin },
    });
}));
/** Exchange Google ID token for a Koliath global session profile. */
app.post("/api/auth/google", authLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = types_1.googleSessionSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ success: false, message: "idToken is required" });
    }
    try {
        const authUser = yield (0, auth_1.verifyGoogleIdToken)(body.data.idToken);
        const user = yield (0, db_1.upsertGlobalUser)(authUser);
        const dashboard = yield (0, db_1.getDashboardForUser)(user.id);
        res.status(200).json({
            success: true,
            user: dashboard,
        });
    }
    catch (e) {
        console.error(e);
        const status = typeof e === "object" && e && "status" in e ? Number(e.status) : 401;
        const message = e instanceof Error ? e.message : "Authentication failed";
        res.status(status).json({ success: false, message });
    }
}));
/** Authenticated dashboard for the signed-in Google account. */
app.get("/api/me", auth_1.requireAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield (0, db_1.getGlobalUserByGoogleSub)(req.authUser.googleSub);
        if (!user) {
            const created = yield (0, db_1.upsertGlobalUser)(req.authUser);
            const dashboard = yield (0, db_1.getDashboardForUser)(created.id);
            return res.status(200).json(dashboard);
        }
        const dashboard = yield (0, db_1.getDashboardForUser)(user.id);
        res.status(200).json(dashboard);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Failed to load profile" });
    }
}));
app.post("/api/me/link-app", auth_1.requireAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = types_1.linkAppAccountSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    try {
        let user = yield (0, db_1.getGlobalUserByGoogleSub)(req.authUser.googleSub);
        if (!user)
            user = yield (0, db_1.upsertGlobalUser)(req.authUser);
        const dashboard = yield (0, db_1.linkAppAccount)(user.id, body.data.sourceApp, body.data.appUid, body.data.referralCode);
        res.status(200).json({ success: true, user: dashboard });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Failed to link app account" });
    }
}));
app.post("/api/referrals/register", auth_1.requireAppWebhook, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const body = types_1.registerReferralSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    try {
        const result = yield (0, db_1.registerReferralCode)(body.data.code, body.data.sourceApp, null, (_a = body.data.ownerEmail) !== null && _a !== void 0 ? _a : null);
        res.status(200).json(Object.assign({ success: true }, result));
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Failed to register referral code" });
    }
}));
app.get("/api/referrals/stats", auth_1.requireAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const query = types_1.referralStatsQuerySchema.safeParse(req.query);
    if (!query.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(query.error) });
    }
    try {
        let user = yield (0, db_1.getGlobalUserByGoogleSub)(req.authUser.googleSub);
        if (!user)
            user = yield (0, db_1.upsertGlobalUser)(req.authUser);
        const owns = yield (0, db_1.userOwnsCode)(user.id, query.data.code);
        if (!owns) {
            return res.status(403).json({
                msg: "This referral code is not linked to your Koliath account.",
            });
        }
        const stats = yield (0, db_1.getReferralStats)(query.data.code);
        if (!stats.exists) {
            return res.status(404).json({
                msg: "No referral code found.",
            });
        }
        res.status(200).json(stats);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ msg: "Internal server error" });
    }
}));
app.get("/api/referrals/rewards", (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rewards = yield (0, db_1.getAllRewards)();
        res.status(200).json(rewards);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ msg: "Internal server error" });
    }
}));
app.post("/api/referrals/redeem", auth_1.requireAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const body = types_1.redeemRewardSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    try {
        let user = yield (0, db_1.getGlobalUserByGoogleSub)(req.authUser.googleSub);
        if (!user)
            user = yield (0, db_1.upsertGlobalUser)(req.authUser);
        const contactEmail = ((_a = body.data.contactEmail) !== null && _a !== void 0 ? _a : user.email).toLowerCase();
        const code = user.global_code;
        const stats = yield (0, db_1.getReferralStats)(code);
        if (!stats.exists) {
            return res.status(404).json({ success: false, message: "Referral account not found" });
        }
        yield (0, db_1.createRedemption)(code, body.data.rewardId, contactEmail);
        res.status(200).json({
            success: true,
            message: "Redemption request submitted! We'll email your gift card within 48 hours.",
        });
    }
    catch (e) {
        console.error(e);
        const err = e;
        if (err.status === 404 || err.status === 400) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}));
/** Legacy path — apps should migrate to /api/referrals/qualify with webhook secret. */
app.post("/api/referrals/event", auth_1.requireAppWebhook, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = types_1.referralEventSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    try {
        const event = yield (0, db_1.createReferralEvent)(body.data.referrerCode, body.data.referredEmail, body.data.deviceId, body.data.sourceApp);
        res.status(200).json({
            success: true,
            status: event.status,
            pointsAwarded: event.points_awarded,
        });
    }
    catch (e) {
        console.error(e);
        const err = e;
        if (err.code === "23505") {
            return res.status(400).json({
                success: false,
                message: "This device or email has already been referred for this app.",
            });
        }
        if (err.code === "UNKNOWN_CODE" || err.status === 404) {
            return res.status(404).json({
                success: false,
                message: "Unknown referral code.",
            });
        }
        res.status(500).json({ success: false, message: "Failed to process referral event" });
    }
}));
/** Trusted qualification webhook — Sapient day_active, Adverts purchase, etc. */
app.post("/api/referrals/qualify", auth_1.requireAppWebhook, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = types_1.qualifyReferralSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    try {
        const result = yield (0, db_1.qualifyReferral)(body.data.referrerCode, body.data.referredEmail, body.data.deviceId, body.data.sourceApp, body.data.event);
        res.status(200).json(result);
    }
    catch (e) {
        console.error(e);
        const err = e;
        if (err.code === "23505") {
            return res.status(400).json({
                success: false,
                message: "Duplicate referral for this app.",
            });
        }
        if (err.status === 404) {
            return res.status(404).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: "Failed to qualify referral" });
    }
}));
app.get("/api/referrals/validate", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const code = req.query.code;
    if (!code || typeof code !== "string") {
        return res.status(400).json({ success: false, message: "Code is required" });
    }
    try {
        const isValid = yield (0, db_1.validateReferralCode)(code);
        if (isValid) {
            res.status(200).json({ success: true });
        }
        else {
            res.status(404).json({ success: false, message: "Invalid referral code" });
        }
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}));
app.post("/api/referrals/track", trackingLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = types_1.referralTrackingSchema.safeParse(req.body);
    if (!body.success) {
        return res.status(400).json({ msg: zod_1.z.treeifyError(body.error) });
    }
    try {
        const ipAddress = req.ip || req.socket.remoteAddress || undefined;
        const userAgent = req.headers["user-agent"] || undefined;
        yield (0, db_1.trackReferralEvent)(body.data.code, body.data.eventType, body.data.deviceId, ipAddress, userAgent);
        res.status(200).json({ success: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Failed to track referral event" });
    }
}));
app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
});
app.listen(config_1.config.port, () => {
    console.log(`Koliath rewards API listening on port ${config_1.config.port}`);
});
