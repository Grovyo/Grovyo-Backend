const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const reviewSchema = new mongoose.Schema(
  {
    senderId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    productId: { type: ObjectId, ref: "Product", required: true },
    text: {
      type: String,
    },
    dp: { type: String },
    name: { type: String },
    like: { type: Number, default: 0 },
    likedby: [{ type: ObjectId, ref: "User" }],
    disklike: { type: Number, default: 0 },
    reply: { type: [String] },
    content: { type: String },
    contentType: { type: String },
    stars: { type: Number, default: 0, enum: [1, 2, 3, 4, 5], required: true },
    desc: { type: String, maxLength: 100 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);
