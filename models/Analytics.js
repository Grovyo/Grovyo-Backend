const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const Analytics = new mongoose.Schema({
  id: { type: String },
  date: { type: String },
  Y1: { type: Number },
  Y2: { type: Number },
  Y3: { type: Number },
  Sales: { type: Number },
  click: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  creation: { type: Date, default: Date.now },
  cost: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  activemembers: [{ type: ObjectId, ref: "User" }],
  newmembers: [{ type: ObjectId, ref: "User" }],
  paidmembers: [{ type: ObjectId, ref: "User" }],
  newvisitor: [{ type: ObjectId, ref: "User" }],
  returningvisitor: [{ type: ObjectId, ref: "User" }],
});

module.exports = mongoose.model("Analytics", Analytics);
