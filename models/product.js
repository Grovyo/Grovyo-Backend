const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    maxLength: 150,
    required: true,
  },
  brandname: {
    type: String,
    maxLength: 50,
    required: true,
  },
  desc: {
    type: String,
    required: true,
  },
  creator: {
    type: ObjectId,
    ref: "User",
    required: true,
  },
  orders: [
    {
      type: ObjectId,
      ref: "Order",
      required: true,
    },
  ],
  orderscount: { type: Number, default: 0 },
  quantity: {
    type: Number,
  },
  shippingcost: {
    type: Number,
  },
  price: {
    type: Number,
  },
  discountedprice: { type: Number },
  sellername: { type: String },
  images: [
    {
      content: { type: String },
      type: { type: String },
      size: { type: String },
      thumbnail: { type: String },
    },
  ],
  totalstars: {
    type: Number,
    default: 0,
  },
  isverified: {
    type: String,
    enum: ["in review", "verified", "rejected"],
    default: "in review",
  },
  reviews: [{ type: ObjectId, ref: "Review" }],
  producthighlightskey: { type: [String] },
  producthighlightsvalue: { type: [String] },
  productdetails: { type: String },
  producthighlights: { type: String },
  percentoff: { type: Number, default: 0 },
  questions: { type: Number, default: 0 },
  type: { type: String },
  tags: { type: [String] },
  weight: { type: String },
  reviewed: [{ type: ObjectId, ref: "User" }],
  status: {
    type: String,
    default: "Unblock",
    enum: ["Unblock", "Block"],
  },
  sharescount: { type: Number, default: 0 },
  // changed
  itemsold: { type: Number, default: 0 },
  collectionss: { type: ObjectId, ref: "Collectionss" },
  createdAt: { type: Date, default: Date.now },
  // variants: [
  //   { Name: { type: String }, contents: [{ types: { type: String } }] },
  // ],
  isvariant: { type: Boolean, default: false },
  variants: [
    {
      name: { type: String }, //size
      value: { type: String }, //color
      category: [
        {
          name: String, //xl
          price: Number, //amount,
          discountedprice: Number,
          content: String, //dp
          quantity: Number,
        },
      ],
      isactive: { type: Boolean, default: false },
    },
  ],
});

module.exports = mongoose.model("Product", productSchema);
