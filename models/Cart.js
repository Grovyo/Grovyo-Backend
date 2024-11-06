const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const CartSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: "Product" },
    status: { type: String, default: "pending" },
    delivery: { type: String },
    quantity: { type: Number },
    conf: { type: Object },
  },
  { timestamps: true }
);

CartSchema.index({ title: "text" });

module.exports = mongoose.model("Cart", CartSchema);
