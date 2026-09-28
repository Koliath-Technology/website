import type { Pool } from "pg"
import { applySqlMigrations } from "../migrate"

const CATALOG = [
    {
        appId: "app_sapient_android",
        slug: "sapient",
        name: "Sapient",
        packageId: "in.koliath.sapient",
        platform: "android",
        points: 100,
    },
    {
        appId: "app_adverts_android",
        slug: "adverts",
        name: "Adverts",
        packageId: "in.koliath.adverts",
        platform: "android",
        points: 100,
    },
    {
        appId: "app_adverts_rewards_android",
        slug: "adverts-rewards",
        name: "Adverts Rewards",
        packageId: "in.koliath.advertsrewards",
        platform: "android",
        points: 50,
    },
    {
        appId: "app_advert_cohort_android",
        slug: "advert-cohort",
        name: "Advert Cohort",
        packageId: "in.koliath.advertcohort",
        platform: "android",
        points: 75,
    },
    {
        appId: "app_diabetic_buddy_android",
        slug: "diabetic-buddy",
        name: "Diabetic Buddy",
        packageId: "in.koliath.diabeticbuddy",
        platform: "android",
        points: 100,
    },
] as const

export async function ensureInstallSchema(pool: Pool): Promise<void> {
    await applySqlMigrations(pool)
    await seedCatalogApps(pool)
}

export async function seedCatalogApps(pool: Pick<Pool, "query">): Promise<void> {
    for (const app of CATALOG) {
        await pool.query(
            `INSERT INTO apps (
                app_id, slug, name, package_id, platform, developer_name, company,
                status, points_awarded, verification_config
             ) VALUES ($1, $2, $3, $4, $5, 'Koliath', 'Koliath', 'active', $6, '{}'::jsonb)
             ON CONFLICT (app_id) DO NOTHING`,
            [app.appId, app.slug, app.name, app.packageId, app.platform, app.points]
        )
    }
}
