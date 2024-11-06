const express = require("express");
const router = express.Router();

const {
  getbio,
  userprositedetails,
  getcommunities,
  fetchproducts,
  getprositedetails,
} = require("../controllers/prosite");

router.get("/getbio/:userId", getbio);
router.get("/userprositedetails/:id", userprositedetails);
router.get("/getcommunities/:userId", getcommunities);
router.get("/fetchproduct/:userId/:mainuserId", fetchproducts);
router.get("/v1/prosite/:id", getprositedetails);

module.exports = router;
