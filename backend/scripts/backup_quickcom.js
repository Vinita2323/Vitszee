import mongodbPkg from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { MongoClient, BSON } = mongodbPkg;
const { EJSON } = BSON;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceUri = process.env.MONGO_URI;

if (!sourceUri) {
    console.error('ERROR: MONGO_URI is missing in backend/.env');
    process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(__dirname, '..', 'backups', `quickcom_backup_${timestamp}`);

async function createBackup() {
    console.log('====================================================');
    console.log('TASK 2: BACKUP EXISTING DATABASE (quickcom)');
    console.log('Source URI:', sourceUri.replace(/:([^@]+)@/, ':****@'));
    console.log('Backup Directory:', backupDir);
    console.log('====================================================');

    const client = new MongoClient(sourceUri);

    try {
        await client.connect();
        console.log('✔ Connected to source MongoDB cluster');

        const db = client.db('quickcom');
        const collections = await db.listCollections().toArray();

        console.log(`Found ${collections.length} collections to backup.\n`);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const summary = [];
        let totalDocs = 0;

        for (const colInfo of collections) {
            const colName = colInfo.name;
            const collection = db.collection(colName);

            const docs = await collection.find({}).toArray();
            const indexes = await collection.indexes();
            const count = docs.length;

            totalDocs += count;

            const colBackup = {
                collectionName: colName,
                count: count,
                indexes: indexes,
                options: colInfo.options || {},
                documents: docs
            };

            const filePath = path.join(backupDir, `${colName}.ejson`);
            // EJSON stringify preserves all MongoDB BSON types (ObjectId, Date, Decimal128, Binary, etc.)
            const serialized = EJSON.stringify(colBackup, null, 2, { relaxed: false });
            fs.writeFileSync(filePath, serialized, 'utf8');

            summary.push({
                collection: colName,
                documents: count,
                indexes: indexes.length,
                file: `${colName}.ejson`
            });

            console.log(`  ✔ Backed up '${colName}': ${count} docs, ${indexes.length} indexes -> ${colName}.ejson`);
        }

        const manifestPath = path.join(backupDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            dbName: 'quickcom',
            collectionCount: collections.length,
            totalDocuments: totalDocs,
            collections: summary
        }, null, 2), 'utf8');

        console.log('\n====================================================');
        console.log('✔ BACKUP COMPLETED SUCCESSFULLY!');
        console.log(`Total Collections: ${collections.length}`);
        console.log(`Total Documents: ${totalDocs}`);
        console.log(`Manifest File: ${manifestPath}`);
        console.log('====================================================\n');

        // Verification of backup files
        console.log('Verifying Backup Integrity...');
        let verifiedDocs = 0;
        for (const s of summary) {
            const fPath = path.join(backupDir, s.file);
            const content = fs.readFileSync(fPath, 'utf8');
            const parsed = EJSON.parse(content, { relaxed: false });
            if (parsed.documents.length !== s.documents) {
                throw new Error(`Backup verification failed for ${s.collection}: count mismatch`);
            }
            verifiedDocs += parsed.documents.length;
        }

        if (verifiedDocs !== totalDocs) {
            throw new Error(`Total verified docs (${verifiedDocs}) does not match total docs (${totalDocs})`);
        }

        console.log(`✔ BACKUP VERIFIED: All ${verifiedDocs} documents across ${summary.length} collections parsed correctly.`);

    } catch (err) {
        console.error('❌ BACKUP FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await client.close();
    }
}

createBackup();
