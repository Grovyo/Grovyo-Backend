const express = require("express");
const {
  getaproduct,
  fetchcart,
  fetchorders,
  fecthallprods,
  fetchallsubscriptions,
  addtocart,
  getreviews,
  create,
  updatequantity,
  removecartorder,
  cancellationrequest,
  createtopicporder,
  finalisetopicorder,
  cod,
  createrzporder,
  finaliseorder,
} = require("../controllers/product");
const router = express.Router();

router.get("/getaproduct/:id/:productId", getaproduct);
router.get("/fetchcart/:userId", fetchcart);
router.get("/fetchorders/:userId", fetchorders);
router.post("/addtocart/:userId/:productId", addtocart);
router.get("/fetchallprods/:userId/:ordid", fecthallprods);
router.post("/v1/fetchallsubscriptions/:id", fetchallsubscriptions);
router.get("/getreviews/:prodId", getreviews);
router.post("/addreview/:userId/:productId/", create);
router.post("/updatequantity/:userId/:cartId", updatequantity);
router.post("/removecartorder/:id/:cartId/:productId", removecartorder);
router.post("/cancellationrequest/:id/:oid", cancellationrequest);

router.post("/v1/createtopicporder/:id/:topicId", createtopicporder);
router.post("/v1/finalisetopicorder/:id/:ordId/:topicId", finalisetopicorder);

router.post("/createrzporder/:id", createrzporder);
router.post("/finaliseorder/:id/:ordId", finaliseorder);

router.post("/createnewproductorder/:userId", cod);

module.exports = router;
