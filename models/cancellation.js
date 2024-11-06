const mongoose = require("mongoose");
const Cancellation = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    reason: { type: String },
    status: {
      type: String,
      enum: ["cancelled", "pending", "non-cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cancellation", Cancellation);
