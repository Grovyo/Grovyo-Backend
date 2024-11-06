const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const InterestSchema = new mongoose.Schema(
  {
    title: { type: String },
    desc: { type: String },
    post: [{ type: ObjectId, ref: "Post" }],
    count: { type: Number },
    tags: [{ type: ObjectId, ref: "Tags" }],
    pic: { type: String },
  },
  { timestamps: true }
);

InterestSchema.index({ title: "text" });

module.exports = mongoose.model("Interest", InterestSchema);
