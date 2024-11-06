const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const membership = new mongoose.Schema({
  title: { type: String },
  start: { type: String },
  end: { type: String },
  details: [{ type: String }],
  amount: { type: Number },
  productlimit: { type: Number },
  topiclimit: { type: Number },
  communitylimit: { type: Number },
  collectionlimit: { type: Number },
  dms: { type: Number },
  tagging: { type: Number },
  deliverylimit: { type: Number },
  discountedprice: { type: Number },
  plantype: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
  percentoff: { type: Number },
  broughtby: [
    {
      user: { type: ObjectId, ref: "User" },
      ending: { type: String },
      paymentdetails: {
        mode: { type: String },
        amount: { type: Number },
        gstamount: { type: Number },
      },
    },
  ],
});
membership.index({ title: "text" });
module.exports = mongoose.model("Membership", membership);
