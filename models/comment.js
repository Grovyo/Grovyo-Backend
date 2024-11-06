const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const commentSchema = new mongoose.Schema(
  {
    senderId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    postId: { type: ObjectId, ref: "Post", required: true },
    text: {
      type: String,
      required: true,
    },
    dp: { type: String },
    name: { type: String },
    like: { type: Number, default: 0 },
    likedby: [{ type: ObjectId, ref: "User" }],
    dislikedby: [{ type: ObjectId, ref: "User" }],
    disklike: { type: Number, default: 0 },
    repliedby: [{ type: ObjectId, ref: "User" }],
    replycount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Comment", commentSchema);
