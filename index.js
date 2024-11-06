const express = require("express");
const app = express();
const mongoose = require("mongoose");
const morgan = require("morgan");
const cors = require("cors");
const compression = require("compression");
const { PRODDB, PORT } = require("./helpers/config");

//middlewares
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(morgan("dev"));

const userRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/post");
const prositeRoutes = require("./routes/prosite");
const conversationRoutes = require("./routes/convRoutes");
const searchRoutes = require("./routes/search");
const communityRoutes = require("./routes/community");
const productRoutes = require("./routes/product");
const membershipRoutes = require("./routes/membership");

app.use("/api", userRoutes);
app.use("/api", postRoutes);
app.use("/api", prositeRoutes);
app.use("/api", conversationRoutes);
app.use("/api", searchRoutes);
app.use("/api", communityRoutes);
app.use("/api", productRoutes);
app.use("/api", membershipRoutes);

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", false);
    mongoose.connect(PRODDB).then(() => {
      console.log("DB is connected");
    });
  } catch (err) {
    console.log(err);
  }
};

connectDB();

//connect to App
const connectApp = () =>
  app.listen(PORT, () => console.log(`Server is running on ${PORT}`))
  .on("error", console.error);


connectApp();
