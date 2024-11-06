require("dotenv").config();
const DATABASE = process.env.DATABASE || "mongodb://192.168.29.170:27017";
const PRODDB = process.env.PRODDB || "mongodb://Ruh:Shreyan%40sh379@13.201.106.188:27017/?authMechanism=DEFAULT";
const PORT = process.env.PORT || 7700;
const CDN = process.env.CDN || "minio.grovyo.xyz";
const REDIS = process.env.REDIS || "redis://192.168.29.221:6379";
const RZPKEY = process.env.RZPKEY || "rzp_test_jXDMq8a2wN26Ss";
const RZPSEC = process.env.RZPSEC || "bxyQhbzS0bHNBnalbBg9QTDo";
const SECKEY = process.env.SECKEY || "[ 16, 12, 3, 7, 9, 5, 11, 6, 3, 2, 10, 1, 13, 3, 13, 4 ]";
const MY_SECRET_KEY = process.env.MY_SECRET_KEY || "Shreyansh@379";

const BUCKET_NAME = process.env.BUCKET_NAME || "bucage";
const MSG_BUCKET = process.env.MSG_BUCKET || "msg-ing";
const AD_BUCKET = process.env.AD_BUCKET || "ad-s";
const POST_BUCKET = process.env.POST_BUCKET || "post-ing";
const PRODUCT_BUCKET = process.env.PRODUCT_BUCKET || "product-s";
const BILLING_BUCKET = process.env.BILLING_BUCKET || "bill-ing";
const BUCKET_REGION = process.env.BUCKET_REGION || "ap-south-1";
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY || "AKIA4MTWHEKLLPIYGX7U";
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY || "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";

const URL = process.env.URL || "https://dn3w8358m09e7.cloudfront.net/";
const PRODUCT_URL = process.env.PRODUCT_URL || "https://d2a79j8kmqfrmq.cloudfront.net/";
const POST_URL = process.env.POST_URL || "https://dt46iilh1kepb.cloudfront.net/";
const MSG_URL = process.env.MSG_URL || "https://d3k9hx3li2ssij.cloudfront.net/";
const AD_URL = process.env.AD_URL || "https://dp5wpbz0px6y7.cloudfront.net/";
const BILL_URL = process.env.BILL_URL || "https://d2w9o7ay2i560n.cloudfront.net/";
const CLOUDFRONT_KEY = process.env.CLOUDFRONT_KEY || "KF57MO0QETG33";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "-----BEGIN RSA PRIVATE KEY-----\n...-----END RSA PRIVATE KEY-----";
const LANGUAGE_MODEL_API_KEY = process.env.LANGUAGE_MODEL_API_KEY || "AIzaSyDy6qMIQ4rwB1HzPa-SMLh_G1DprkBjfao";
const GEOCODE = process.env.GEOCODE || "AIzaSyB5shfEhOuEkSS7vnKm9QZ-jpDkcTFS1O0";

const CLOUDFLARE_EMAIL = process.env.CLOUDFLARE_EMAIL || "traceit241@gmail.com";
const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY || "734a572aedf89b6e63a580892eaa5144558ca";
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "7e5b74b8b8d7ee18beb31e82958568b0";

const CLIENTID = process.env.CLIENTID || "86D3565969F411EFAC7102E825E2EA5C";
const CLIENTSECRET = process.env.CLIENTSECRET || "ac7102e825e2ea5c86d3569869f411ef";

module.exports = {
  DATABASE,
  PRODDB,
  PORT,
  CDN,
  REDIS,
  RZPKEY,
  RZPSEC,
  SECKEY,
  MY_SECRET_KEY,
  CLIENTID,
  BUCKET_NAME,
  CLIENTSECRET,
  MSG_BUCKET,
  AD_BUCKET,
  POST_BUCKET,
  PRODUCT_BUCKET,
  BILLING_BUCKET,
  BUCKET_REGION,
  AWS_ACCESS_KEY,
  AWS_SECRET_KEY,
  URL,
  PRODUCT_URL,
  POST_URL,
  MSG_URL,
  AD_URL,
  BILL_URL,
  CLOUDFRONT_KEY,
  PRIVATE_KEY,
  LANGUAGE_MODEL_API_KEY,
  GEOCODE,
  CLOUDFLARE_EMAIL,
  CLOUDFLARE_API_KEY,
  CLOUDFLARE_ZONE_ID
};
