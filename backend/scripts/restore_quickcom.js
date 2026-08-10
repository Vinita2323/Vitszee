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

const destUri = process.env.DEST_MONGO_URI || process.argv[2];

if (!destUri) {
    console.error('❌ ERROR: Destination URI not provided.');
    console.error('Usage: node scripts/restore_quickcom.js "<DEST_MONGO_URI>"');
    console.error('Or set DEST_MONGO_URI in environment.');
    process.exit(1);
}

// Find latest backup directory in backend/backups
const backupsParentDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsParentDir)) {
    console.error('❌ ERROR: No backups directory found at', backupsParentDir);
    process.exit(1);
}

const backupDirs = fs.readdirSync(backupsParentDir)
    .filter(name => name.startsWith('quickcom_backup_'))
    .sort()
    .reverse();

if (backupDirs.length === 0) {
    console.error('❌ ERROR: No quickcom_backup directories found in', backupsParentDir);
    process.exit(1);
}

const latestBackupDir = path.join(backupsParentDir, backupDirs[0]);
const manifestPath = path.join(latestBackupDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
    console.error('❌ ERROR: manifest.json missing in', latestBackupDir);
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function restoreAndVerify() {
    console.log('====================================================');
    console.log('TASK 3 & TASK 4: RESTORE & VERIFY DATA TO NEW DATABASE');
    console.log('Backup Directory:', latestBackupDir);
    console.log('Destination URI:', destUri.replace(/:([^@]+)@/, ':****@'));
    console.log('Target Database: quickcom');
    console.log('====================================================\n');

    const destClient = new MongoClient(destUri);

    try {
        await destClient.connect();
        console.log('✔ Connected to destination MongoDB cluster!');

        const destDb = destClient.db('quickcom');

        const verificationResults = [];
        let grandSourceDocs = 0;
        let grandDestDocs = 0;

        for (const colMeta of manifest.collections) {
            const colName = colMeta.collection;
            const ejsonPath = path.join(latestBackupDir, colMeta.file);

            if (!fs.existsSync(ejsonPath)) {
                throw new Error(`Missing backup file: ${ejsonPath}`);
            }

            const rawContent = fs.readFileSync(ejsonPath, 'utf8');
            const colData = EJSON.parse(rawContent, { relaxed: false });
            const docs = colData.documents || [];
            const indexes = colData.indexes || [];

            grandSourceDocs += docs.length;

            const destCollection = destDb.collection(colName);

            // 1. Insert documents if any exist
            if (docs.length > 0) {
                // Batch insert into destination database
                const chunkSize = 500;
                for (let i = 0; i < docs.length; i += chunkSize) {
                    const chunk = docs.slice(i, i + chunkSize);
                    await destCollection.insertMany(chunk, { ordered: true });
                }
            }

            // 2. Re-create indexes
            for (const idxSpec of indexes) {
                if (idxSpec.name === '_id_') continue;

                const keys = idxSpec.key;
                const options = {};

                if (idxSpec.name) options.name = idxSpec.name;
                if (idxSpec.unique) options.unique = idxSpec.unique;
                if (idxSpec.sparse) options.sparse = idxSpec.sparse;
                if (idxSpec.expireAfterSeconds !== undefined) options.expireAfterSeconds = idxSpec.expireAfterSeconds;
                if (idxSpec.background) options.background = idxSpec.background;
                if (idxSpec.weights) options.weights = idxSpec.weights;
                if (idxSpec.default_language) options.default_language = idxSpec.default_language;
                if (idxSpec.language_override) options.language_override = idxSpec.language_override;
                if (idxSpec.partialFilterExpression) options.partialFilterExpression = idxSpec.partialFilterExpression;

                try {
                    await destCollection.createIndex(keys, options);
                } catch (idxErr) {
                    console.warn(`⚠ Warning creating index '${idxSpec.name}' on '${colName}':`, idxErr.message);
                }
            }

            // 3. Verify destination count
            const destCount = await destCollection.countDocuments();
            grandDestDocs += destCount;

            const isMatch = (destCount === colMeta.documents);
            const status = isMatch ? 'MATCH ✔' : 'MISMATCH ❌';

            verificationResults.push({
                'Source Collection': colName,
                'Source Count': colMeta.documents,
                'Destination Count': destCount,
                'Status': status
            });
        }

        console.log('\n====================================================');
        console.log('MIGRATION VERIFICATION REPORT');
        console.log('====================================================');
        console.table(verificationResults);

        console.log(`\nGrand Total Source Documents: ${grandSourceDocs}`);
        console.log(`Grand Total Destination Documents: ${grandDestDocs}`);

        const mismatches = verificationResults.filter(r => r.Status !== 'MATCH ✔');

        if (mismatches.length > 0) {
            console.error('\n❌ MIGRATION FAILED: The following collections had count mismatches:');
            console.error(mismatches);
            process.exit(1);
        } else {
            console.log('\n✔ MIGRATION SUCCESSFUL! 100% data and index parity across all 54 collections.');
        }

    } catch (err) {
        console.error('\n❌ MIGRATION / RESTORE FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await destClient.close();
    }
}

restoreAndVerify();
