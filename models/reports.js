const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const ReportSchema = new mongoose.Schema(
  {
    senderId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
    },
    desc: [{ type: String, required: true }],
    reportedid: { id: { type: String }, what: { type: String } },
    status: {
      type: String,
      default: "Pending",
      enum: ["Resolved", "Pending"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", ReportSchema);
