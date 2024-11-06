const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const SubscriptionsSchema = new mongoose.Schema(
  {
    topic: { type: ObjectId, ref: "Topic" },
    community: { type: ObjectId, ref: "Community" },
    validity: { type: String },
    paymentId: { type: String },
    orderId: { type: String, unique: true },
    amount: { type: Number },
    currentStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "cancelled",
        "completed",
        "failed",
        "returned",
      ],
      default: "pending",
    },
    onlineorderid: { type: String },
    paymentMode: {
      type: String,
      enum: ["UPI", "Card"],
      default: "Cash",
    },
    purchasedby: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

SubscriptionsSchema.index({ onlineorderid: "text" });

module.exports = mongoose.model("Subscriptions", SubscriptionsSchema);
