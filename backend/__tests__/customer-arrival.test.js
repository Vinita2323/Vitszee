import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { startMemoryMongo, prepareCollections, clearAll, stopMemoryMongo } from "./helpers/memoryMongo.js";

process.env.NODE_ENV = "test";

const notifications = [];
const socketEvents = [];
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: (type, payload) => notifications.push({ type, payload }),
  default: {},
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: (orderId, payload) => socketEvents.push({ kind: "status", orderId, payload }),
  emitToCustomer: (id, e) => socketEvents.push({ kind: "customer", id: String(id), ...e }),
  emitToOrder: (orderId, e) => socketEvents.push({ kind: "order", orderId, ...e }),
}));

await startMemoryMongo("customer_arrival");
const { default: Order } = await import("../app/models/order.js");
const { markArrivedAtCustomer } = await import("../app/services/customerArrivalService.js");
await prepareCollections();

const rider = new mongoose.Types.ObjectId();
const customer = new mongoose.Types.ObjectId();
// customer drop point, and a rider position ~40 m away / ~4 km away
const DROP = { lat: 23.0983113, lng: 72.5568285 };
const NEAR = { lat: 23.0986, lng: 72.5569 };
const FAR = { lat: 23.1343, lng: 72.5568 };
let n = 0;

async function outForDelivery(overrides = {}) {
  n += 1;
  return Order.create({
    orderId: `ORD-ARR-${n}`,
    customer,
    seller: new mongoose.Types.ObjectId(),
    deliveryBoy: rider,
    paymentMode: "COD",
    workflowVersion: 2,
    workflowStatus: "OUT_FOR_DELIVERY",
    status: "out_for_delivery",
    address: { location: DROP },
    ...overrides,
  });
}

beforeEach(async () => {
  await clearAll();
  notifications.length = 0;
  socketEvents.length = 0;
  delete process.env.ARRIVAL_PROXIMITY_ENFORCED;
});
afterAll(async () => {
  await stopMemoryMongo();
});

describe("rider marks 'reached the customer'", () => {
  it("records server time, location and distance, and tells the customer", async () => {
    const order = await outForDelivery();
    const before = Date.now();
    const r = await markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng);

    expect(r.alreadyArrived).toBe(false);
    expect(r.distanceMeters).toBeLessThan(100);
    expect(r.withinRange).toBe(true);
    const saved = await Order.findById(order._id).lean();
    expect(saved.reachedCustomerAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(saved.reachedCustomerLocation).toMatchObject(NEAR);
    expect(saved.reachedCustomerDistanceM).toBe(r.distanceMeters);
    // state is not changed: still out for delivery, OTP step comes next
    expect(saved.workflowStatus).toBe("OUT_FOR_DELIVERY");

    expect(notifications).toHaveLength(1);
    expect(notifications[0].payload).toMatchObject({ role: "customer", userId: String(customer) });
    expect(socketEvents.some((e) => e.event === "delivery:arrived" && e.kind === "customer")).toBe(true);
  });

  it("is idempotent: a second tap returns the first arrival and does not notify again", async () => {
    const order = await outForDelivery();
    const first = await markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng);
    const second = await markArrivedAtCustomer(rider, order.orderId, FAR.lat, FAR.lng);
    expect(second.alreadyArrived).toBe(true);
    expect(new Date(second.reachedCustomerAt).getTime()).toBe(new Date(first.reachedCustomerAt).getTime());
    expect(notifications).toHaveLength(1);
  });

  it("concurrent taps record exactly one arrival", async () => {
    const order = await outForDelivery();
    const results = await Promise.all([
      markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng),
      markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng),
      markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng),
    ]);
    expect(results.filter((r) => !r.alreadyArrived)).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it("only the assigned rider can mark arrival", async () => {
    const order = await outForDelivery();
    await expect(
      markArrivedAtCustomer(new mongoose.Types.ObjectId(), order.orderId, NEAR.lat, NEAR.lng),
    ).rejects.toMatchObject({ statusCode: 404, code: "UNAUTHORIZED_DELIVERY" });
    expect((await Order.findById(order._id).lean()).reachedCustomerAt).toBeNull();
  });

  it("is refused unless the order is out for delivery", async () => {
    const order = await outForDelivery({ workflowStatus: "PICKUP_READY", status: "packed" });
    await expect(markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng)).rejects.toMatchObject({
      statusCode: 409,
      code: "ORDER_NOT_READY",
    });
  });

  it("needs a location", async () => {
    const order = await outForDelivery();
    await expect(markArrivedAtCustomer(rider, order.orderId, undefined, undefined)).rejects.toMatchObject({
      statusCode: 400,
      code: "LOCATION_REQUIRED",
    });
  });

  it("records the distance but does not block when proximity is not enforced (current testing mode)", async () => {
    const order = await outForDelivery();
    const r = await markArrivedAtCustomer(rider, order.orderId, FAR.lat, FAR.lng);
    expect(r.distanceMeters).toBeGreaterThan(1000);
    expect(r.withinRange).toBe(false);
  });

  it("blocks a rider who is too far away when ARRIVAL_PROXIMITY_ENFORCED=true", async () => {
    process.env.ARRIVAL_PROXIMITY_ENFORCED = "true";
    const order = await outForDelivery();
    await expect(markArrivedAtCustomer(rider, order.orderId, FAR.lat, FAR.lng)).rejects.toMatchObject({
      statusCode: 403,
      code: "PROXIMITY_OUT_OF_RANGE",
    });
    expect((await Order.findById(order._id).lean()).reachedCustomerAt).toBeNull();
    // and allows the same rider once they are close
    const ok = await markArrivedAtCustomer(rider, order.orderId, NEAR.lat, NEAR.lng);
    expect(ok.alreadyArrived).toBe(false);
  });
});
