/**
 * Minimal in-memory stand-in for a Mongoose model. Supports exactly what the
 * COD QR payment service uses: equality (null matches missing), $in, $ne,
 * dotted paths, $set and $push, find/findOne/findById/create/countDocuments.
 */
let seq = 1;

const getPath = (obj, path) =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const setPath = (obj, path, value) => {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
};

const eq = (a, b) => {
  if (b === null) return a === null || a === undefined;
  return String(a) === String(b);
};

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return cond.some((f) => matches(doc, f));
    const value = getPath(doc, key);
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("$in" in cond) return cond.$in.some((c) => eq(value, c));
      if ("$nin" in cond) return !cond.$nin.some((c) => eq(value, c));
      if ("$ne" in cond) return !eq(value, cond.$ne);
      if ("$gt" in cond) return value > cond.$gt;
      if ("$lt" in cond) return value != null && value < cond.$lt;
    }
    return eq(value, cond);
  });
}

function applyUpdate(doc, update = {}) {
  Object.entries(update.$set || {}).forEach(([k, v]) => setPath(doc, k, v));
  Object.entries(update.$push || {}).forEach(([k, v]) => {
    const arr = getPath(doc, k) || [];
    arr.push(v);
    setPath(doc, k, arr);
  });
}

const query = (value) => {
  const p = Promise.resolve(value);
  p.sort = () => p;
  p.lean = () => p;
  p.select = () => p;
  p.session = () => p;
  p.limit = () => p;
  p.skip = () => p;
  p.populate = () => p;
  return p;
};

export function createFakeModel({ defaults = () => ({}), uniqueActive = null } = {}) {
  const rows = [];
  const model = {
    rows,
    reset() {
      rows.length = 0;
    },
    seed(doc) {
      const row = { _id: `id_${seq++}`, ...defaults(), ...doc };
      rows.push(row);
      return row;
    },
    async create(doc) {
      if (Array.isArray(doc)) {
        return doc.map((d) => model.seed(d));
      }
      if (uniqueActive && doc[uniqueActive.flag]) {
        const clash = rows.find(
          (r) => r[uniqueActive.flag] && String(r[uniqueActive.key]) === String(doc[uniqueActive.key]),
        );
        if (clash) {
          const err = new Error("E11000 duplicate key");
          err.code = 11000;
          throw err;
        }
      }
      return model.seed(doc);
    },
    async aggregate(pipeline = []) {
      return [];
    },
    findOne(filter) {
      return query(rows.find((r) => matches(r, filter)) || null);
    },
    findById(id) {
      return query(rows.find((r) => String(r._id) === String(id)) || null);
    },
    find(filter) {
      return query(rows.filter((r) => matches(r, filter)));
    },
    countDocuments(filter) {
      return Promise.resolve(rows.filter((r) => matches(r, filter)).length);
    },
    exists(filter) {
      const row = rows.find((r) => matches(r, filter));
      return Promise.resolve(row ? { _id: row._id } : null);
    },
    findOneAndUpdate(filter, update) {
      const row = rows.find((r) => matches(r, filter));
      if (row) applyUpdate(row, update);
      return query(row || null);
    },
    async updateOne(filter, update) {
      const row = rows.find((r) => matches(r, filter));
      if (row) applyUpdate(row, update);
      return { modifiedCount: row ? 1 : 0 };
    },
  };
  return model;
}
