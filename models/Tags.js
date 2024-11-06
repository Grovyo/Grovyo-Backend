const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const TagsSchema = new mongoose.Schema(
  {
    title: { type: String },
    desc: { type: String },
    post: [{ type: ObjectId, ref: "Post" }],
    count: { type: Number },
    tags: { type: String },
    pic: { type: String },
  },
  { timestamps: true }
);

TagsSchema.index({ title: "text" });

module.exports =  mongoose.model("Tags", TagsSchema);
