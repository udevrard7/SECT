import pg from 'pg';

const DIRECT_URL = "postgresql://postgres.gnicihntcisgkkkuwolx:Victoire%401993%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

const client = new pg.Client({
  connectionString: DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log("✅ Connecté à Supabase PostgreSQL");

  // 1. Check if table already exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'AIProviderConfig'
    );
  `);
  
  if (tableCheck.rows[0].exists) {
    console.log("⚠️ Table AIProviderConfig existe déjà, suppression pour recréer...");
    await client.query('DROP TABLE IF EXISTS "AIProviderConfig" CASCADE;');
  }

  // 2. Create the table
  await client.query(`
    CREATE TABLE "AIProviderConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "provider" TEXT NOT NULL,
      "baseUrl" TEXT,
      "apiKey" TEXT,
      "model" TEXT,
      "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
      "maxTokens" INTEGER NOT NULL DEFAULT 4096,
      "isActive" BOOLEAN NOT NULL DEFAULT false,
      "extraConfig" TEXT,
      "lastTestAt" TIMESTAMP(3),
      "lastTestOk" BOOLEAN,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("✅ Table AIProviderConfig créée avec succès");

  // 3. Insert Z-AI provider
  await client.query(`
    INSERT INTO "AIProviderConfig" (id, name, provider, "baseUrl", "apiKey", model, temperature, "maxTokens", "isActive", "createdAt", "updatedAt")
    VALUES (
      'zai-provider-001',
      'Z-AI (principal)',
      'ZAI',
      'https://z.ai/api/v1',
      'b945570ac79446ee9e726f2c92f7ff0a.gOhlXbUdxrOMwC1I',
      'default',
      0.7,
      4096,
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  `);
  console.log("✅ Fournisseur Z-AI inséré avec succès");

  // 4. Verify
  const result = await client.query('SELECT id, name, provider, "isActive" FROM "AIProviderConfig";');
  console.log("\n📋 Contenu de la table AIProviderConfig :");
  console.table(result.rows);

  await client.end();
  console.log("\n🎉 Déploiement Supabase terminé avec succès !");
}

main().catch(err => {
  console.error("❌ Erreur:", err.message);
  process.exit(1);
});
