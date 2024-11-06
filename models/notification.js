const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const notificationSchema = new mongoose.Schema(
  {
    senderId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    recId: { type: ObjectId, ref: "User", required: true },
    text: {
      type: String,
      required: true,
    },
    type: String,
    dp: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
