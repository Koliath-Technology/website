import { decorateDownloadUrl } from "./downloads"

// Placeholder for Branch.io Web SDK initialization
// In a real production scenario, you would install branch-sdk and initialize it with your Branch Key.
// import branch from 'branch-sdk';

export const initBranch = () => {
    // branch.init('key_live_YOUR_BRANCH_KEY_HERE', (err, data) => { ... });
    console.log("Branch.io initialized (placeholder)");
};

export const generateBranchLink = async (referralCode: string): Promise<string> => {
    // In production:
    /*
    return new Promise((resolve, reject) => {
        branch.link({
            tags: ['referral'],
            channel: 'website',
            feature: 'share',
            data: {
                'referral_code': referralCode,
                '$fallback_url': 'https://koliath.com/diabetic-app'
            }
        }, (err, link) => {
            if (err) reject(err);
            else resolve(link);
        });
    });
    */
    
    // Fallback/Placeholder: return a simulated Branch link or direct deep link.
    console.log("Generating Branch link for code:", referralCode);
    return `https://diabeticbuddy.app.link/referral?code=${encodeURIComponent(referralCode)}`;
};

function safeReferralCode(referralCode?: string | null): string | null {
    if (!referralCode) return null
    const normalized = referralCode.trim().toUpperCase()
    if (!/^[A-Z0-9-]{4,20}$/.test(normalized)) return null
    return normalized
}

export const handleAppDownload = async (
    referralCode?: string | null,
    verification?: { token: string; appId: string }
) => {
    const code = safeReferralCode(referralCode)
    if (code) {
        try {
            const link = await generateBranchLink(code);
            const target = new URL(link)
            if (target.protocol !== "https:") {
                fallbackRedirect(code, verification)
                return
            }
            const decorated = decorateDownloadUrl(target.toString(), {
                refCode: code,
                verificationToken: verification?.token,
                appId: verification?.appId,
            })
            window.location.href = decorated || target.toString();
        } catch (e) {
            console.error("Failed to generate branch link", e);
            fallbackRedirect(code, verification);
        }
    } else {
        fallbackRedirect(null, verification);
    }
};

const fallbackRedirect = (
    referralCode?: string | null,
    verification?: { token: string; appId: string }
) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const raw = isIOS
        ? "https://apps.apple.com/app/idYOUR_APP_ID"
        : "https://play.google.com/store/apps/details?id=com.koliath.diabeticbuddy";
    const decorated = decorateDownloadUrl(raw, {
        refCode: referralCode ?? null,
        verificationToken: verification?.token,
        appId: verification?.appId,
    })
    window.location.href = decorated || raw;
};
