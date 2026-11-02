import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Isolated, throwaway MongoDB replica set (transactions work) for tests.
 * Never touches the application database: MONGO_URI is not read.
 */
let replSet = null;

export async function startMemoryMongo(dbName = "test") {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { dbName });
  return mongoose.connection;
}

/**
 * Transactions cannot create collections / finish index builds on a fresh
 * database, so create them up-front. Call after importing the models.
 */
export async function prepareCollections() {
  for (const model of Object.values(mongoose.models)) {
    try {
      await model.createCollection();
    } catch {
      /* already exists */
    }
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
}

export async function clearAll() {
  await Promise.all(
    Object.values(mongoose.models).map((m) =>
      m.deleteMany({}).catch(() => {
        /* append-only collections (audit trail) refuse deletes — that is intended */
      }),
    ),
  );
}

export async function stopMemoryMongo() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
  replSet = null;
}
