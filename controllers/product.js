const User = require("../models/userAuth");
const Product = require("../models/product");
const Review = require("../models/review");
const Cart = require("../models/Cart");
const { PRODUCT_URL, URL } = require("../helpers/config");
const Order = require("../models/orders");
const Topic = require("../models/topic");
const Subscriptions = require("../models/Subscriptions");
const Cancellation = require("../models/cancellation");
const Community = require("../models/community");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const admin = require("../fireb");
const Razorpay = require("razorpay");
const {
  validatePaymentVerification,
} = require("razorpay/dist/utils/razorpay-utils");
const Analytics = require("../models/Analytics");
const SellerOrder = require("../models/SellerOrder");
const Admin = require("../models/admin");
const geolib = require("geolib");
const instance = new Razorpay({
  key_id: "rzp_live_Ms5I8V8VffSpYq",
  key_secret: "Sy04bmraRqV9RjLRj81MX0g7",
});
function sumArray(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  return total;
}

exports.getaproduct = async (req, res) => {
  const { id, productId } = req.params;

  try {
    // Fetch user and product details in parallel
    const [user, product] = await Promise.all([
      User.findById(id).select("puchase_products cartproducts reviewed"),
      Product.findById(productId).populate({
        path: "reviews",
        select: "text stars desc name createdAt dp",
        options: { limit: 5 },
      }),
    ]);

    if (!product) {
      return res
        .status(404)
        .json({ message: "Product not found", success: false });
    }

    // Initialize variables and shared logic
    let isReviewed =
      product.reviewed.includes(user?._id) &&
      user.puchase_products.includes(product?._id);
    let inCart = user.cartproducts.includes(product?._id);
    let urls = product.images
      .filter((image) => image !== null)
      .map((image) => PRODUCT_URL + image.content);
    let reviews = product.reviews
      .filter((review) => review !== null)
      .map((review) => ({
        review,
        dp: URL + review.dp,
      }));

    // If the product is not a variant
    if (!product.isvariant) {
      return res.status(200).json({
        data: {
          incart: inCart,
          canreview: isReviewed,
          totalreviews: product.reviewed.length,
          product,
          urls,
          isvariant: product.isvariant,
          review: reviews,
          success: true,
        },
      });
    }

    // If the product is a variant, process variants
    const color = product.variants.map((variant) => variant.value);
    const size = product.variants[0]?.category.map((cat) => cat.name);

    // Update variant category with image URLs
    const updatedVariants = product.variants.map((variant) => {
      const updatedCategory = variant.category.map((cat) => ({
        ...cat.toObject(),
        imageUrl: PRODUCT_URL + cat.content,
      }));
      return { ...variant.toObject(), category: updatedCategory };
    });

    res.status(200).json({
      data: {
        color,
        size,
        incart: inCart,
        canreview: isReviewed,
        totalreviews: product.reviewed.length,
        product,
        variants: updatedVariants,
        isvariant: product.isvariant,
        urls,
        review: reviews,
        success: true,
      },
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(400).json({ message: error.message, success: false });
  }
};

exports.fetchcart = async (req, res) => {
  const { userId } = req.params;
  try {
    // Fetch the user and populate the cart and product details
    const user = await User.findById(userId)
      .select("cart address")
      .populate({
        path: "cart",
        populate: {
          path: "product",
          model: "Product",
        },
      })
      .lean();

    if (!user) {
      return res.status(404).json({ message: "No user found", success: false });
    }

    const ids = [];
    const images = [];
    let total = 0;
    let discountedTotal = 0;
    let totalQty = 0;
    let totalDiscount = 0;

    const merge = user.cart
      .map((item) => {
        if (!item.product) return null; // Skip if product is null

        ids.push(item.product._id);

        // Determine the image URL based on product type
        let image;
        if (item.product.isvariant) {
          image = item.conf?.pic;
        } else {
          image = item.product.images?.length
            ? `${PRODUCT_URL}${item.product.images[0].content}`
            : null;
        }
        images.push(image);

        // Calculate totals and quantities
        const price = item.product.isvariant
          ? item.conf.price
          : item.product.price;
        const discountedPrice = item.product.isvariant
          ? item.conf.discountedprice
          : item.product.discountedprice;

        total += price * item.quantity;
        discountedTotal += discountedPrice * item.quantity;
        totalQty += item.quantity;
        totalDiscount += item.product.percentoff || 0;

        // Return the merged object
        return {
          c: item,
          image,
        };
      })
      .filter(Boolean); // Filter out any null values

    // Construct the complete address
    const completeAddress = user.address
      ? `${user?.address?.streetaddress}`
      : "Add an address";

    res.status(200).json({
      totalqty: [totalQty],
      total: [total],
      discountedtotal: [discountedTotal],
      data: merge,
      discount: [totalDiscount],
      address: completeAddress,
      success: true,
      ids,
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.fetchorders = async (req, res) => {
  const { userId } = req.params;
  try {
    // Fetch the user data
    const user = await User.findById(userId)
      .select("puchase_history location _id")
      .lean();
    if (!user) {
      return res.status(404).json({ message: "No user found", success: false });
    }

    // Fetch and process each order in parallel using Promise.all
    const orderPromises = user.puchase_history.map(async (orderId) => {
      const order = await Order.findById(orderId.toString())
        .populate(
          "productId",
          "name brandname creator images inclusiveprice price percentoff sellername totalstars"
        )
        .populate("sellerId", "isverified fullname")
        .lean();

      if (order?.productId && order?.sellerId) {
        return order;
      } else {
        // Remove the invalid order and update the user's purchase history
        if (order) await order.remove();
        await User.updateOne(
          { _id: user._id },
          { $pull: { puchase_history: order?._id } }
        );
        return null;
      }
    });

    // Await all the order processing promises and filter out null values
    const fetchedOrders = (await Promise.all(orderPromises)).filter(Boolean);

    // Collect product images for the orders
    const images = fetchedOrders
      .map((order) => {
        if (order.productId[0]?.images?.length > 0) {
          return `${PRODUCT_URL}${order.productId[0].images[0].content}`;
        } else {
          order.remove();
          return null;
        }
      })
      .filter(Boolean); // Filter out null images

    // Prepare the final data by merging orders and images
    const mergedData = fetchedOrders.reverse().map((orders, index) => ({
      orders,
      image: images[index],
    }));

    res.status(200).json({
      data: mergedData,
      address: user.location,
      success: true,
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.fecthallprods = async (req, res) => {
  const { ordid } = req.params;
  try {
    const order = await Order.findById(ordid).populate(
      "productId",
      "name price images"
    );

    const data = order.productId.map((product, index) => ({
      name: product.name,
      pic: PRODUCT_URL + product.images[0]?.content,
      price: order.data[index]?.price,
      qty: order.data[index]?.qty,
      prodId: product,
    }));

    res.status(200).json({
      totalprice: order.total,
      tax: order.taxes,
      delcharge: order.deliverycharges,
      totalqty: order.quantity,
      orderId: order.orderId,
      mode: order.paymentMode,
      placeon: order.createdAt,
      data,
      success: true,
    });
  } catch (e) {
    console.error(e); // Log the error for debugging
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};

exports.fetchallsubscriptions = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch subscriptions and their associated topics in parallel
    const subs = await Subscriptions.find({ purchasedby: id });

    // Prepare an array of topic IDs to fetch in one go
    const topicIds = subs.map((sub) => sub.topic);
    const topics = await Topic.find({ _id: { $in: topicIds } }).populate(
      "community",
      "title dp"
    );

    const currentTimestamp = Date.now();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

    const merged = subs
      .map((sub) => {
        const topic = topics.find(
          (t) => t._id.toString() === sub.topic.toString()
        );

        if (!topic) {
          sub.remove();
          return null;
        }

        const purchaseIndex = topic.purchased.findIndex(
          (f) => f.id?.toString() === id
        );
        const timestamp =
          purchaseIndex !== -1 ? topic.purchased[purchaseIndex].broughton : 0;

        const isWithin30Days = currentTimestamp - timestamp <= thirtyDaysInMs;

        return {
          s: sub,
          status: {
            topic: topic.title,
            community: topic.community.title,
            validity: isWithin30Days ? "Active" : "Expired",
            dp: URL + topic.community.dp,
          },
        };
      })
      .filter((item) => item !== null); // Filter out any null items

    res.status(200).json({ success: true, merged });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, message: "Something went wrong" });
  }
};

exports.addtocart = async (req, res) => {
  const { userId, productId } = req.params;
  const { quantity, cartId, action, cat } = req.body;

  try {
    if (!userId || !productId) {
      return res
        .status(400)
        .json({ message: "Invalid request", success: false });
    }

    const prod = await Product.findById(productId).select("variants");

    const cart = await Cart.findById(cartId).select("_id quantity");

    if (!cart) {
      const cate = cat
        ? { conf: cat }
        : {
            variant: prod?.variants[0]?.name,
            category: prod?.variants[0]?.category[0]?.name,
            pic: PRODUCT_URL + prod?.variants[0]?.category[0]?.content,
            price: prod?.variants[0]?.category[0]?.price,
            discountedprice: prod?.variants[0]?.category[0]?.discountedprice,
          };

      const newCart = new Cart({
        product: productId,
        quantity,
        conf: cate,
      });
      await newCart.save();

      // Update user cart and cart products
      await Promise.all([
        User.updateOne({ _id: userId }, { $push: { cart: newCart._id } }),
        User.updateOne({ _id: userId }, { $push: { cartproducts: productId } }),
      ]);

      return res.status(200).json({ newCart, success: true });
    } else {
      // Update existing cart item based on the action
      if (action === "inc") {
        await Cart.updateOne({ _id: cart._id }, { $inc: { quantity: 1 } });
      } else if (action === "dec") {
        await Cart.updateOne({ _id: cart._id }, { $inc: { quantity: -1 } });
      } else {
        // Handle cart removal
        await Promise.all([
          Cart.deleteOne({ _id: cart._id }),
          User.updateOne({ _id: userId }, { $pull: { cart: cart._id } }),
          User.updateOne(
            { _id: userId },
            { $pull: { cartproducts: productId } }
          ),
        ]);
      }

      return res.status(200).json({ success: true });
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.getreviews = async (req, res) => {
  const { prodId } = req.params;

  try {
    // Fetch reviews with populated senderId and handle potential errors
    const reviews = await Review.find({ productId: prodId })
      .populate("senderId", "fullname profilepic isverified")
      .limit(50)
      .sort({ createdAt: -1 });

    // Check if reviews were found
    if (!reviews || reviews.length === 0) {
      return res.status(400).json({ message: "No reviews", success: false });
    }

    // Map reviews to include profile pictures and review content URLs
    const finalReviews = reviews.map((review) => ({
      review,
      dp: review.senderId ? URL + review.senderId.profilepic : null,
      reviewContent: review.content ? URL + review.content : null,
    }));

    // Respond with the final reviews
    res.status(200).json({ finalReviews, success: true });
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.create = async (req, res) => {
  const { userId, productId } = req.params;
  const { text, stars, desc } = req.body;

  const user = await User.findById(userId)
    .select("fullname profilepic _id")
    .lean();

  if (!user) {
    return res.status(404).json({ message: "User not found", success: false });
  }
  try {
    const review = new Review({
      senderId: userId,
      productId: productId,
      text: text,
      stars: stars,
      desc: desc,
      name: user?.fullname,
      dp: user?.profilepic,
    });
    await review.save();
    await Product.updateOne(
      { _id: productId },
      {
        $push: { reviews: review._id, reviewed: user._id },
        $inc: { totalstars: 1 },
      }
    );
    res.status(200).json({ review, success: true });
  } catch (e) {
    res.status(400).json({ error: e.message, success: false });
  }
};

exports.updatequantity = async (req, res) => {
  const { userId, cartId } = req.params;
  const { quantity } = req.body;
  try {
    const user = await User.findById(userId).select("cart _id");
    const cart = await user.cart.includes(cartId);
    if (!user || !cart) {
      res.status(404).json({ message: "Not found", success: false });
    } else {
      await Cart.updateOne({ _id: cartId }, { $set: { quantity: quantity } });

      res.status(200).json({ success: true });
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.removecartorder = async (req, res) => {
  try {
    const { id, cartId, productId } = req.params;
    const user = await User.exists({ _id: id });

    if (!user) {
      return res.status(404).json({ message: "User or Product not found" });
    } else {
      await User.updateOne(
        { _id: id },
        {
          $pull: {
            cartproducts: productId,
            cart: cartId,
          },
        }
      );
      res.status(200).json({ success: true });
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

exports.cancellationrequest = async (req, res) => {
  try {
    const { id, oid } = req.params;
    const { reason } = req.body;
    const updatedOrder = await Order.findByIdAndUpdate(
      oid,
      { currentStatus: "cancelled", reason: reason },
      { new: true }
    );
    if (!updatedOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found!" });
    }
    const cancel = new Cancellation({
      userid: id,
      orderId: oid,
      reason: reason,
      status: "cancelled",
    });
    await cancel.save();
    res.status(200).json({ success: true, data: cancel });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

//topics purchase
exports.createtopicporder = async (req, res) => {
  try {
    const { id, topicId } = req.params;
    const [user, topic] = await Promise.all([
      User.findById(id).select("phone email").lean(),
      Topic.findById(topicId).select("_id community price").lean(),
    ]);

    if (!user || !topic) {
      return res.status(404).json({ message: "User or topic not found" });
    } else {
      const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;
      const newValidity = new Date(
        Date.now() + thirtyDaysInMillis
      ).toISOString();
      const oi = Math.floor(Math.random() * 9000000) + 1000000;

      const subscription = new Subscriptions({
        topic: topic._id,
        community: topic.community,
        validity: newValidity,
        amount: topic.price,
        orderId: oi,
        paymentMode: "UPI",
        currentStatus: "pending",
      });

      const [newSubscription] = await Promise.all([
        subscription.save(),
        User.updateOne(
          { _id: id },
          { $push: { subscriptions: subscription._id } }
        ),
      ]);

      instance.orders.create(
        {
          amount: parseInt(topic.price) * 100,
          currency: "INR",
          receipt: `receiptofsubs#${oi}`,
          notes: {
            price: topic.price,
            subscription: newSubscription._id,
          },
        },
        function (err, subs) {
          if (err) {
            res.status(400).json({ err, success: false });
          } else {
            res.status(200).json({
              oid: subs.id,
              subs: newSubscription._id,
              phone: user?.phone,
              email: user?.email,
              success: true,
            });
          }
        }
      );
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

exports.finalisetopicorder = async (req, res) => {
  try {
    const { id, ordId, topicId } = req.params;
    const {
      oid,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      status,
    } = req.body;

    // Step 1: Fetch user and topic details first
    const [user, topic] = await Promise.all([
      User.findById(id).select("_id").lean(),
      Topic.findById(topicId).select("_id price community").lean(),
    ]);

    if (!user || !topic) {
      return res.status(404).json({ message: "User or Topic not found" });
    }

    // Step 2: Now fetch the community using the topic's community ID
    const community = await Community.findById(topic.community)
      .select("creator _id")
      .lean();

    // Step 3: Validate the payment
    const isValid = validatePaymentVerification(
      { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
      razorpay_signature,
      "Sy04bmraRqV9RjLRj81MX0g7"
    );

    if (isValid) {
      // Step 4: Update the records in parallel
      await Promise.all([
        Subscriptions.updateOne(
          { _id: ordId },
          {
            $set: {
              currentStatus: status,
              onlineorderid: oid,
              purchasedby: user._id,
            },
          }
        ),
        Topic.updateOne(
          { _id: topic._id },
          {
            $addToSet: {
              purchased: { id: user._id, broughton: Date.now() },
              members: user._id,
              notifications: user._id,
            },
            $inc: { memberscount: 1, earnings: topic.price },
          }
        ),
        Community.updateOne(
          { _id: community._id },
          { $inc: { paidmemberscount: 1 } }
        ),
        User.updateOne(
          { _id: user._id },
          { $addToSet: { topicsjoined: topic._id }, $inc: { totaltopics: 1 } }
        ),
        User.updateOne(
          { _id: community.creator },
          {
            $inc: { moneyearned: topic.price, topicearning: topic.price },
            $addToSet: {
              earningtype: {
                how: "Topic Purchase",
                when: Date.now(),
              },
              subscriptions: ordId,
            },
          }
        ),
      ]);

      res.status(200).json({ success: true });
    } else {
      // Handle invalid payment scenario
      await Subscriptions.updateOne(
        { _id: ordId },
        { $set: { currentStatus: status, onlineorderid: oid } }
      );

      res.status(200).json({ success: true });
    }
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, error: e.message });
  }
};

//products purchase
exports.createrzporder = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, deliverycharges, productId, total, rzptotal } = req.body;

    const ordern = await Order.countDocuments();
    const user = await User.findById(id).select("_id cart phone email").lean();
    const products = await Product.find({ _id: { $in: productId } })
      .populate("creator", "storeAddress")
      .populate("collectionss", "category");

    let oi = Math.floor(Math.random() * 9000000) + 1000000;

    let fast = [];
    let slow = [];

    if (!user && products.length <= 0) {
      return res.status(404).json({ message: "User or Product not found" });
    } else {
      for (let product of products) {
        //seperating food and grocery

        if (
          product.collectionss &&
          product.collectionss.category === "Food and Grocery"
        ) {
          fast.push(product._id);
        } else {
          slow.push(product._id);
        }
      }

      //processing orders seprately

      //generating mesId
      function msgid() {
        return Math.floor(100000 + Math.random() * 900000);
      }

      let finalmaindata = [];

      //processing orders seprately

      //for F&G
      if (fast.length > 0) {
        let sellers = [];
        let maindata = [];
        let qty = [];
        let prices = [];
        let oi = Math.floor(Math.random() * 9000000) + 1000000;

        //checking for products in fast
        let matchedObjects = [];
        user.cart.forEach((obj1) => {
          let matchingObj = fast.find(
            (obj2) => obj2.toString() === obj1.product.toString()
          );

          if (matchingObj) {
            matchedObjects.push(obj1);
          }
        });

        for (let i = 0; i < matchedObjects.length; i++) {
          const product = await Product.findById(
            matchedObjects[i].product
          ).populate("creator", "storeAddress");
          prices.push(product?.discountedprice);
          sellers.push(product?.creator?._id);
          qty.push(matchedObjects[i].quantity);
          maindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });

          finalmaindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });
        }

        let finalqty = sumArray(qty);
        let finalamount = sumArray(prices);

        //a new order is created
        const order = new Order({
          buyerId: user._id,
          productId: fast,
          quantity: finalqty,
          total: finalamount,
          orderId: oi,
          paymentMode: "UPI",
          currentStatus: "pending",
          deliverycharges: deliverycharges,
          timing: "Arriving Soon!",
          orderno: ordern + 1,
          data: maindata,
          sellerId: sellers,
        });
        await order.save();

        //upating order in customers purchase history
        await User.updateOne(
          { _id: user._id },
          { $push: { puchase_history: order._id } }
        );
      }

      //for Usual
      if (slow.length > 0) {
        let sellers = [];
        let maindata = [];
        let qty = [];
        let prices = [];
        let oi = Math.floor(Math.random() * 9000000) + 1000000;

        //checking for products in fast
        let matchedObjects = [];

        user.cart.forEach((obj1) => {
          let matchingObj = slow.find(
            (obj2) => obj2?.toString() === obj1.product?.toString()
          );

          if (matchingObj) {
            matchedObjects.push(obj1);
          }
        });

        for (let i = 0; i < matchedObjects.length; i++) {
          const product = await Product.findById(
            matchedObjects[i].product
          ).populate("creator", "storeAddress");
          prices.push(product?.discountedprice);
          sellers.push(product?.creator?._id);
          qty.push(matchedObjects[i].quantity);
          maindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });

          finalmaindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });
        }

        let finalqty = sumArray(qty);

        let finalamount = sumArray(prices);

        //a new order is created
        const order = new Order({
          buyerId: user._id,
          productId: slow,
          quantity: finalqty,
          total: finalamount,
          orderId: oi,
          paymentMode: "UPI",
          currentStatus: "pending",
          deliverycharges: deliverycharges,
          timing: "Tommorow, by 7:00 pm",
          orderno: ordern + 1,
          data: maindata,
          sellerId: sellers,
        });
        await order.save();

        //upating order in customers purchase history
        await User.updateOne(
          { _id: user._id },
          { $push: { puchase_history: order._id } }
        );
      }
    }

    let pids = JSON.stringify(productId);

    //creatign a rzp order
    instance.orders.create(
      {
        amount: parseInt(rzptotal),
        currency: "INR",
        receipt: `receipt#${oi}`,
        notes: {
          total,
          quantity,
          deliverycharges,
          pids,
          total,
        },
      },
      function (err, order) {
        console.log(err, order);
        if (err) {
          res.status(400).json({ err, success: false });
        } else {
          res.status(200).json({
            oid: order.id,
            order: oi,
            phone: user?.phone,
            email: user?.email,
            success: true,
          });
        }
      }
    );
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

//finalising the product order(UPI)
exports.finaliseorder = async (req, res) => {
  try {
    const { id, ordId } = req.params;
    const {
      oid,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      status,
    } = req.body;

    const user = await User.findById(id).populate({
      path: "cart",
      populate: {
        path: "product",
        model: "Product",
      },
    });

    let qty = [];
    let sellers = [];

    for (let i = 0; i < user?.cart?.length; i++) {
      qty.push(user.cart[i].quantity);
    }

    if (!user) {
      return res.status(404).json({ message: "User or Product not found" });
    } else {
      const isValid = validatePaymentVerification(
        { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
        razorpay_signature,
        "Sy04bmraRqV9RjLRj81MX0g7"
      );

      if (isValid) {
        await Order.updateMany(
          { orderId: oid },
          { $set: { currentStatus: status, onlineorderid: oid } }
        );
        await User.updateOne(
          { _id: user._id },
          { $unset: { cart: [], cartproducts: [] } }
        );

        for (let i = 0; i < order.data.length; i++) {
          const sellerorder = new SellerOrder({
            buyerId: order.buyerId,
            productId: order.data[i].product,
            quantity: order.data[i].qty,
            total: order.data[i].price,
            orderId: oi,
            paymentMode: "Cash",
            currentStatus: "processing",
            deliverycharges: deliverycharges,
            // timing: "Tommorow, by 7:00 pm",
            sellerId: order.data[i].seller,
            orderno: parseInt((await Order.countDocuments()) + 1),
          });
          await sellerorder.save();

          //commission taken by company until membership is purchased by the creator (10%)
          const product = await Product.findById(
            order.data[i].product
          ).populate("creator", "storeAddress ismembershipactive memberships");

          sellers.push(product?.creator?._id);

          let deduction = 0; //10% amount earned by company and substracted from creator as fees

          if (
            product.creator?.ismembershipactive === false ||
            product.creator?.memberships?.membership?.toString() ===
              "65671e5204b7d0d07ef0e796"
          ) {
            deduction = product.discountedprice * 0.1;
          }

          //earning distribution
          let today = new Date();

          let year = today.getFullYear();
          let month = String(today.getMonth() + 1).padStart(2, "0");
          let day = String(today.getDate()).padStart(2, "0");

          let formattedDate = `${day}/${month}/${year}`;

          if (deduction > 0) {
            //admin earning
            let earned = {
              how: "Sales Commission",
              amount: deduction,
              when: Date.now(),
              id: order._id,
            };

            await Admin.updateOne(
              { date: formattedDate },
              {
                $inc: { todayearning: deduction },
                $push: { earningtype: earned },
              }
            );
          }

          //creator earning
          let storeearning = product.discountedprice - deduction;

          let earning = { how: "product", when: Date.now() };
          await User.updateOne(
            { _id: product?.creator?._id },
            {
              $addToSet: { customers: user._id, earningtype: earning },
              $inc: { storeearning: storeearning },
            }
          );
          await Product.updateOne(
            { _id: product._id },
            { $inc: { itemsold: 1 } }
          );
        }

        //generating mesId
        function msgid() {
          return Math.floor(100000 + Math.random() * 900000);
        }

        //sending notification to each store creator that a new order has arrived
        const workspace = await User.findById("65f5539d09dbe77dea51400d");
        for (const sell of sellers) {
          const seller = await User.findById(sell);
          const convs = await Conversation.findOne({
            members: { $all: [seller?._id, workspace._id] },
          });
          const senderpic = process.env.URL + workspace.profilepic;
          const recpic = process.env.URL + seller.profilepic;
          const timestamp = `${new Date()}`;
          const mesId = msgid();

          if (convs) {
            let data = {
              conversationId: convs._id,
              sender: workspace._id,
              text: `A new order with orderId #${order.orderId} has arrived.`,
              mesId: mesId,
            };
            const m = new Message(data);
            await m.save();

            if (seller?.notificationtoken) {
              const msg = {
                notification: {
                  title: `Workspace`,
                  body: `A new order with orderId #${order.orderId} has arrived.`,
                },
                data: {
                  screen: "Conversation",
                  sender_fullname: `${workspace?.fullname}`,
                  sender_id: `${workspace?._id}`,
                  text: `A new order with orderId ${oi} has arrived.`,
                  convId: `${convs?._id}`,
                  createdAt: `${timestamp}`,
                  mesId: `${mesId}`,
                  typ: `message`,
                  senderuname: `${workspace?.username}`,
                  senderverification: `${workspace.isverified}`,
                  senderpic: `${senderpic}`,
                  reciever_fullname: `${seller.fullname}`,
                  reciever_username: `${seller.username}`,
                  reciever_isverified: `${seller.isverified}`,
                  reciever_pic: `${recpic}`,
                  reciever_id: `${seller._id}`,
                },
                token: seller?.notificationtoken,
              };

              await admin
                .messaging()
                .send(msg)
                .then((response) => {
                  console.log("Successfully sent message");
                })
                .catch((error) => {
                  console.log("Error sending message:", error);
                });
            }
          } else {
            const conv = new Conversation({
              members: [workspace._id, seller._id],
            });
            const savedconv = await conv.save();
            let data = {
              conversationId: conv._id,
              sender: workspace._id,
              text: `A new order with orderId #${order.orderId} has arrived.`,
              mesId: mesId,
            };
            await User.updateOne(
              { _id: workspace._id },
              {
                $addToSet: {
                  conversations: savedconv?._id,
                },
              }
            );
            await User.updateOne(
              { _id: seller._id },
              {
                $addToSet: {
                  conversations: savedconv?._id,
                },
              }
            );

            const m = new Message(data);
            await m.save();

            const msg = {
              notification: {
                title: `Workspace`,
                body: `A new order with orderId #${order.orderId} has arrived.`,
              },
              data: {
                screen: "Conversation",
                sender_fullname: `${seller?.fullname}`,
                sender_id: `${seller?._id}`,
                text: `A new order with orderId #${order.orderId} has arrived.`,
                convId: `${convs?._id}`,
                createdAt: `${timestamp}`,
                mesId: `${mesId}`,
                typ: `message`,
                senderuname: `${seller?.username}`,
                senderverification: `${seller.isverified}`,
                senderpic: `${recpic}`,
                reciever_fullname: `${workspace.fullname}`,
                reciever_username: `${workspace.username}`,
                reciever_isverified: `${workspace.isverified}`,
                reciever_pic: `${senderpic}`,
                reciever_id: `${workspace._id}`,
              },
              token: seller?.notificationtoken,
            };

            await admin
              .messaging()
              .send(msg)
              .then((response) => {
                console.log("Successfully sent message");
              })
              .catch((error) => {
                console.log("Error sending message:", error);
              });
          }
        }

        //sending notification to admin
        let flashid = "655e189fb919c70bf6895485";
        const flash = await User.findById(flashid);
        const mainuser = await User.findById("65314cd99db37d9109914f3f");
        const timestamp = `${new Date()}`;
        //generating mesId
        function msgid() {
          return Math.floor(100000 + Math.random() * 900000);
        }

        const senderpic = process.env.URL + flash.profilepic;

        const recpic = process.env.URL + mainuser.profilepic;

        const mesId = msgid();
        const convs = await Conversation.findOne({
          members: { $all: [mainuser?._id, flash._id] },
        });

        let data = {
          conversationId: convs._id,
          sender: flash._id,
          text: `A new order with orderId ${oid} has arrived.`,
          mesId: mesId,
        };
        const m = new Message(data);
        await m.save();

        const msg = {
          notification: {
            title: `Grovyo Flash`,
            body: `A new order with orderId ${oid} has arrived.`,
          },
          data: {
            screen: "Conversation",
            sender_fullname: `${mainuser?.fullname}`,
            sender_id: `${mainuser?._id}`,
            text: `A new order with orderId ${oid} has arrived.`,
            convId: `${convs?._id}`,
            createdAt: `${timestamp}`,
            mesId: `${mesId}`,
            typ: `message`,
            senderuname: `${mainuser?.username}`,
            senderverification: `${mainuser.isverified}`,
            senderpic: `${recpic}`,
            reciever_fullname: `${flash.fullname}`,
            reciever_username: `${flash.username}`,
            reciever_isverified: `${flash.isverified}`,
            reciever_pic: `${senderpic}`,
            reciever_id: `${flash._id}`,
          },
          token: mainuser?.notificationtoken,
        };

        await admin
          .messaging()
          .send(msg)
          .then((response) => {
            console.log("Successfully sent message");
          })
          .catch((error) => {
            console.log("Error sending message:", error);
          });

        const order = await Order.findOne({ orderId: ordId });

        //data for sales graph
        let today = new Date();

        let year = today.getFullYear();
        let month = String(today.getMonth() + 1).padStart(2, "0");
        let day = String(today.getDate()).padStart(2, "0");

        let formattedDate = `${day}/${month}/${year}`;

        for (let i = 0; i < order.sellerId.length; i++) {
          let selleruser = await User.findById(order?.sellerId[i]);

          let analytcis = await Analytics.findOne({
            date: formattedDate,
            id: selleruser._id,
          });
          if (analytcis) {
            await Analytics.updateOne(
              { _id: analytcis._id },
              {
                $inc: {
                  Sales: 1,
                },
              }
            );
          } else {
            const an = new Analytics({
              date: formattedDate,
              id: selleruser._id,
              Sales: 1,
            });
            await an.save();
          }
        }

        //assigning deliveris
        const finalorder = await Order.find({ orderId: oid }).populate(
          "collectionss",
          "category"
        );
        for (let orders of finalorder) {
          if (orders?.collectionss.category === "Food & Grocery") {
            credeli({
              oid: orders.orderId,
              id: user._id,
              storeids: sellers,
              total: orders.total,
              instant: true,
            });
          } else {
            credeli({
              oid: orders.orderId,
              id: user._id,
              storeids: sellers,
              total: orders.total,
              instant: false,
            });
          }
        }

        res.status(200).json({ success: true });
      } else {
        await Order.updateOne(
          { orderId: oid },
          { $set: { currentStatus: status, onlineorderid: oid } }
        );

        res.status(200).json({ success: false });
      }
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

//cod
exports.cod = async (req, res) => {
  try {
    const { userId } = req.params;
    const { quantity, deliverycharges, productId, total } = req.body;
    const orderno = await Order.countDocuments();
    const user = await User.findById(userId).populate(
      "cart",
      "quantity product"
    );
    const products = await Product.find({ _id: { $in: productId } })
      .populate("creator", "storeAddress")
      .populate("collectionss", "category");

    let fast = [];
    let slow = [];

    //generating mesId
    function msgid() {
      return Math.floor(100000 + Math.random() * 900000);
    }

    if (user && products.length > 0) {
      for (let product of products) {
        //seperating food and grocery

        if (
          product.collectionss &&
          product.collectionss.category === "Food and Grocery"
        ) {
          fast.push(product._id);
        } else {
          slow.push(product._id);
        }
      }

      let finalmaindata = [];

      //processing orders seprately

      //for F&G
      if (fast.length > 0) {
        let sellers = [];
        let maindata = [];
        let qty = [];
        let prices = [];
        let oi = Math.floor(Math.random() * 9000000) + 1000000;

        //checking for products in fast
        let matchedObjects = [];
        user.cart.forEach((obj1) => {
          let matchingObj = fast.find(
            (obj2) => obj2.toString() === obj1.product.toString()
          );

          if (matchingObj) {
            matchedObjects.push(obj1);
          }
        });

        for (let i = 0; i < matchedObjects.length; i++) {
          const product = await Product.findById(
            matchedObjects[i].product
          ).populate("creator", "storeAddress");
          prices.push(product?.discountedprice);
          sellers.push(product?.creator?._id);
          qty.push(matchedObjects[i].quantity);
          maindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });

          finalmaindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });
        }

        let finalqty = sumArray(qty);
        let finalamount = sumArray(prices);

        //a new order is created
        const order = new Order({
          buyerId: user._id,
          productId: fast,
          quantity: finalqty,
          total: finalamount,
          orderId: oi,
          paymentMode: "Cash",
          currentStatus: "success",
          deliverycharges: deliverycharges,
          timing: "Arriving Soon!",
          orderno: orderno + 1,
          data: maindata,
          sellerId: sellers,
        });
        await order.save();

        //upating order in customers purchase history
        await User.updateOne(
          { _id: user._id },
          { $push: { puchase_history: order._id } }
        );

        //sending notfication to sellers
        for (let i = 0; i < maindata.length; i++) {
          const sellerorder = new SellerOrder({
            buyerId: user._id,
            productId: maindata[i].product,
            quantity: maindata[i].qty,
            total: maindata[i].price,
            orderId: oi,
            paymentMode: "Cash",
            currentStatus: "processing",
            deliverycharges: deliverycharges,
            timing: "Delivery Soon!",
            sellerId: maindata[i].seller,
            orderno: parseInt((await Order.countDocuments()) + 1),
          });
          await sellerorder.save();

          //commission taken by company until membership is purchased by the creator (10%)
          const product = await Product.findById(maindata[i].product).populate(
            "creator",
            "storeAddress ismembershipactive memberships"
          );

          let deduction = 0; //10% amount earned by company and substracted from creator as fees

          if (
            product.creator?.ismembershipactive === false ||
            product.creator?.memberships?.membership?.toString() ===
              "65671e5204b7d0d07ef0e796"
          ) {
            deduction = product.discountedprice * 0.1;
          }

          //earning distribution
          let today = new Date();

          let year = today.getFullYear();
          let month = String(today.getMonth() + 1).padStart(2, "0");
          let day = String(today.getDate()).padStart(2, "0");

          let formattedDate = `${day}/${month}/${year}`;

          if (deduction > 0) {
            //admin earning
            let earned = {
              how: "Sales Commission",
              amount: deduction,
              when: Date.now(),
              id: order._id,
            };

            await Admin.updateOne(
              { date: formattedDate },
              {
                $inc: { todayearning: deduction },
                $push: { earningtype: earned },
              }
            );
          }

          //creator earning
          let storeearning = product.discountedprice - deduction;

          let earning = { how: "product", when: Date.now() };
          await User.updateOne(
            { _id: product?.creator?._id },
            {
              $addToSet: { customers: user._id, earningtype: earning },
              $inc: { storeearning: storeearning },
            }
          );
          await Product.updateOne(
            { _id: product._id },
            { $inc: { itemsold: 1 } }
          );
        }

        //sending notification to each store creator that a new order has arrived
        const workspace = await User.findById("65f5539d09dbe77dea51400d");
        for (const sell of sellers) {
          const seller = await User.findById(sell);
          const convs = await Conversation.findOne({
            members: { $all: [seller?._id, workspace._id] },
          });
          const senderpic = process.env.URL + workspace.profilepic;
          const recpic = process.env.URL + seller.profilepic;
          const timestamp = `${new Date()}`;
          const mesId = msgid();

          if (convs) {
            let data = {
              conversationId: convs._id,
              sender: workspace._id,
              text: `A new order with orderId ${oi} has arrived.`,
              mesId: mesId,
            };
            const m = new Message(data);
            await m.save();

            if (seller?.notificationtoken) {
              const msg = {
                notification: {
                  title: `Workspace`,
                  body: `A new order with orderId ${oi} has arrived.`,
                },
                data: {
                  screen: "Conversation",
                  sender_fullname: `${workspace?.fullname}`,
                  sender_id: `${workspace?._id}`,
                  text: `A new order with orderId ${oi} has arrived.`,
                  convId: `${convs?._id}`,
                  createdAt: `${timestamp}`,
                  mesId: `${mesId}`,
                  typ: `message`,
                  senderuname: `${workspace?.username}`,
                  senderverification: `${workspace.isverified}`,
                  senderpic: `${senderpic}`,
                  reciever_fullname: `${seller.fullname}`,
                  reciever_username: `${seller.username}`,
                  reciever_isverified: `${seller.isverified}`,
                  reciever_pic: `${recpic}`,
                  reciever_id: `${seller._id}`,
                },
                token: seller?.notificationtoken,
              };

              await admin
                .messaging()
                .send(msg)
                .then((response) => {
                  console.log("Successfully sent message");
                })
                .catch((error) => {
                  console.log("Error sending message:", error);
                });
            }
          } else {
            const conv = new Conversation({
              members: [workspace._id, seller._id],
            });
            const savedconv = await conv.save();
            let data = {
              conversationId: conv._id,
              sender: workspace._id,
              text: `A new order with orderId ${oi} has arrived.`,
              mesId: mesId,
            };
            await User.updateOne(
              { _id: workspace._id },
              {
                $addToSet: {
                  conversations: savedconv?._id,
                },
              }
            );
            await User.updateOne(
              { _id: seller._id },
              {
                $addToSet: {
                  conversations: savedconv?._id,
                },
              }
            );

            const m = new Message(data);
            await m.save();

            const msg = {
              notification: {
                title: `Workspace`,
                body: `A new order with orderId ${oi} has arrived.`,
              },
              data: {
                screen: "Conversation",
                sender_fullname: `${seller?.fullname}`,
                sender_id: `${seller?._id}`,
                text: `A new order with orderId ${oi} has arrived.`,
                convId: `${convs?._id}`,
                createdAt: `${timestamp}`,
                mesId: `${mesId}`,
                typ: `message`,
                senderuname: `${seller?.username}`,
                senderverification: `${seller.isverified}`,
                senderpic: `${recpic}`,
                reciever_fullname: `${workspace.fullname}`,
                reciever_username: `${workspace.username}`,
                reciever_isverified: `${workspace.isverified}`,
                reciever_pic: `${senderpic}`,
                reciever_id: `${workspace._id}`,
              },
              token: seller?.notificationtoken,
            };

            await admin
              .messaging()
              .send(msg)
              .then((response) => {
                console.log("Successfully sent message");
              })
              .catch((error) => {
                console.log("Error sending message:", error);
              });
          }
        }

        //sending notification to admin
        let flashid = "655e189fb919c70bf6895485";
        const flash = await User.findById(flashid);
        const mainuser = await User.findById("65314cd99db37d9109914f3f");
        const timestamp = `${new Date()}`;

        const senderpic = process.env.URL + flash.profilepic;
        const recpic = process.env.URL + mainuser.profilepic;

        const mesId = msgid();
        const convs = await Conversation.findOne({
          members: { $all: [mainuser?._id, flash._id] },
        });

        let data = {
          conversationId: convs._id,
          sender: flash._id,
          text: `A new order with orderId ${oi} has arrived.`,
          mesId: mesId,
        };
        const m = new Message(data);
        await m.save();
        if (mainuser?.notificationtoken) {
          const msg = {
            notification: {
              title: `Grovyo Flash`,
              body: `A new order with orderId ${oi} has arrived.`,
            },
            data: {
              screen: "Conversation",
              sender_fullname: `${mainuser?.fullname}`,
              sender_id: `${mainuser?._id}`,
              text: `A new order with orderId ${oi} has arrived.`,
              convId: `${convs?._id}`,
              createdAt: `${timestamp}`,
              mesId: `${mesId}`,
              typ: `message`,
              senderuname: `${mainuser?.username}`,
              senderverification: `${mainuser.isverified}`,
              senderpic: `${recpic}`,
              reciever_fullname: `${flash.fullname}`,
              reciever_username: `${flash.username}`,
              reciever_isverified: `${flash.isverified}`,
              reciever_pic: `${senderpic}`,
              reciever_id: `${flash._id}`,
            },
            token: mainuser?.notificationtoken,
          };

          await admin
            .messaging()
            .send(msg)
            .then((response) => {
              console.log("Successfully sent message");
            })
            .catch((error) => {
              console.log("Error sending message:", error);
            });
        }

        //creating delivery
        credeli({
          oid: order.orderId,
          id: user._id,
          storeids: sellers,
          total: order.total,
          instant: true,
        });
      }

      //for Usual
      if (slow.length > 0) {
        let sellers = [];
        let maindata = [];
        let qty = [];
        let prices = [];
        let oi = Math.floor(Math.random() * 9000000) + 1000000;

        //checking for products in fast
        let matchedObjects = [];
        user.cart.forEach((obj1) => {
          let matchingObj = slow.find(
            (obj2) => obj2.toString() === obj1.product.toString()
          );

          if (matchingObj) {
            matchedObjects.push(obj1);
          }
        });

        for (let i = 0; i < matchedObjects.length; i++) {
          const product = await Product.findById(
            matchedObjects[i].product
          ).populate("creator", "storeAddress");
          prices.push(product?.discountedprice);
          sellers.push(product?.creator?._id);
          qty.push(matchedObjects[i].quantity);
          maindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });

          finalmaindata.push({
            product: product._id,
            seller: product?.creator?._id,
            price: product?.discountedprice,
            qty: matchedObjects[i].quantity,
          });
        }

        let finalqty = sumArray(qty);

        let finalamount = sumArray(prices);

        //a new order is created
        const order = new Order({
          buyerId: user._id,
          productId: slow,
          quantity: finalqty,
          total: finalamount,
          orderId: oi,
          paymentMode: "Cash",
          currentStatus: "success",
          deliverycharges: deliverycharges,
          timing: "Tommorow, by 7:00 pm",
          orderno: orderno + 1,
          data: maindata,
          sellerId: sellers,
        });
        await order.save();

        //upating order in customers purchase history
        await User.updateOne(
          { _id: user._id },
          { $push: { puchase_history: order._id } }
        );

        //sending notfication to sellers
        for (let i = 0; i < maindata.length; i++) {
          const sellerorder = new SellerOrder({
            buyerId: user._id,
            productId: maindata[i].product,
            quantity: maindata[i].qty,
            total: maindata[i].price,
            orderId: oi,
            paymentMode: "Cash",
            currentStatus: "processing",
            deliverycharges: deliverycharges,
            timing: "Delivery Soon!",
            sellerId: maindata[i].seller,
            orderno: parseInt((await Order.countDocuments()) + 1),
          });
          await sellerorder.save();

          //commission taken by company until membership is purchased by the creator (10%)
          const product = await Product.findById(maindata[i].product).populate(
            "creator",
            "storeAddress ismembershipactive memberships"
          );

          let deduction = 0; //10% amount earned by company and substracted from creator as fees

          if (
            product.creator?.ismembershipactive === false ||
            product.creator?.memberships?.membership?.toString() ===
              "65671e5204b7d0d07ef0e796"
          ) {
            deduction = product.discountedprice * 0.1;
          }

          //earning distribution
          let today = new Date();

          let year = today.getFullYear();
          let month = String(today.getMonth() + 1).padStart(2, "0");
          let day = String(today.getDate()).padStart(2, "0");

          let formattedDate = `${day}/${month}/${year}`;

          if (deduction > 0) {
            //admin earning
            let earned = {
              how: "Sales Commission",
              amount: deduction,
              when: Date.now(),
              id: order._id,
            };

            await Admin.updateOne(
              { date: formattedDate },
              {
                $inc: { todayearning: deduction },
                $push: { earningtype: earned },
              }
            );
          }

          //creator earning
          let storeearning = product.discountedprice - deduction;

          let earning = { how: "product", when: Date.now() };
          await User.updateOne(
            { _id: product?.creator?._id },
            {
              $addToSet: { customers: user._id, earningtype: earning },
              $inc: { storeearning: storeearning },
            }
          );
          await Product.updateOne(
            { _id: product._id },
            { $inc: { itemsold: 1 } }
          );
        }

        //sending notification to each store creator that a new order has arrived
        const workspace = await User.findById("65f5539d09dbe77dea51400d");
        for (const sell of sellers) {
          const seller = await User.findById(sell);
          const convs = await Conversation.findOne({
            members: { $all: [seller?._id, workspace._id] },
          });
          const senderpic = process.env.URL + workspace.profilepic;
          const recpic = process.env.URL + seller.profilepic;
          const timestamp = `${new Date()}`;
          const mesId = msgid();

          if (convs) {
            let data = {
              conversationId: convs._id,
              sender: workspace._id,
              text: `A new order with orderId ${oi} has arrived.`,
              mesId: mesId,
            };
            const m = new Message(data);
            await m.save();

            if (seller?.notificationtoken) {
              const msg = {
                notification: {
                  title: `Workspace`,
                  body: `A new order with orderId ${oi} has arrived.`,
                },
                data: {
                  screen: "Conversation",
                  sender_fullname: `${workspace?.fullname}`,
                  sender_id: `${workspace?._id}`,
                  text: `A new order with orderId ${oi} has arrived.`,
                  convId: `${convs?._id}`,
                  createdAt: `${timestamp}`,
                  mesId: `${mesId}`,
                  typ: `message`,
                  senderuname: `${workspace?.username}`,
                  senderverification: `${workspace.isverified}`,
                  senderpic: `${senderpic}`,
                  reciever_fullname: `${seller.fullname}`,
                  reciever_username: `${seller.username}`,
                  reciever_isverified: `${seller.isverified}`,
                  reciever_pic: `${recpic}`,
                  reciever_id: `${seller._id}`,
                },
                token: seller?.notificationtoken,
              };

              await admin
                .messaging()
                .send(msg)
                .then((response) => {
                  console.log("Successfully sent message");
                })
                .catch((error) => {
                  console.log("Error sending message:", error);
                });
            }
          } else {
            const conv = new Conversation({
              members: [workspace._id, seller._id],
            });
            const savedconv = await conv.save();
            let data = {
              conversationId: conv._id,
              sender: workspace._id,
              text: `A new order with orderId ${oi} has arrived.`,
              mesId: mesId,
            };
            await User.updateOne(
              { _id: workspace._id },
              {
                $addToSet: {
                  conversations: savedconv?._id,
                },
              }
            );
            await User.updateOne(
              { _id: seller._id },
              {
                $addToSet: {
                  conversations: savedconv?._id,
                },
              }
            );

            const m = new Message(data);
            await m.save();

            const msg = {
              notification: {
                title: `Workspace`,
                body: `A new order with orderId ${oi} has arrived.`,
              },
              data: {
                screen: "Conversation",
                sender_fullname: `${seller?.fullname}`,
                sender_id: `${seller?._id}`,
                text: `A new order with orderId ${oi} has arrived.`,
                convId: `${convs?._id}`,
                createdAt: `${timestamp}`,
                mesId: `${mesId}`,
                typ: `message`,
                senderuname: `${seller?.username}`,
                senderverification: `${seller.isverified}`,
                senderpic: `${recpic}`,
                reciever_fullname: `${workspace.fullname}`,
                reciever_username: `${workspace.username}`,
                reciever_isverified: `${workspace.isverified}`,
                reciever_pic: `${senderpic}`,
                reciever_id: `${workspace._id}`,
              },
              token: seller?.notificationtoken,
            };

            await admin
              .messaging()
              .send(msg)
              .then((response) => {
                console.log("Successfully sent message");
              })
              .catch((error) => {
                console.log("Error sending message:", error);
              });
          }
        }

        //sending notification to admin
        let flashid = "655e189fb919c70bf6895485";
        const flash = await User.findById(flashid);
        const mainuser = await User.findById("65314cd99db37d9109914f3f");
        const timestamp = `${new Date()}`;

        const senderpic = process.env.URL + flash.profilepic;
        const recpic = process.env.URL + mainuser.profilepic;

        const mesId = msgid();
        const convs = await Conversation.findOne({
          members: { $all: [mainuser?._id, flash._id] },
        });

        let data = {
          conversationId: convs._id,
          sender: flash._id,
          text: `A new order with orderId ${oi} has arrived.`,
          mesId: mesId,
        };
        const m = new Message(data);
        await m.save();
        if (mainuser?.notificationtoken) {
          const msg = {
            notification: {
              title: `Grovyo Flash`,
              body: `A new order with orderId ${oi} has arrived.`,
            },
            data: {
              screen: "Conversation",
              sender_fullname: `${mainuser?.fullname}`,
              sender_id: `${mainuser?._id}`,
              text: `A new order with orderId ${oi} has arrived.`,
              convId: `${convs?._id}`,
              createdAt: `${timestamp}`,
              mesId: `${mesId}`,
              typ: `message`,
              senderuname: `${mainuser?.username}`,
              senderverification: `${mainuser.isverified}`,
              senderpic: `${recpic}`,
              reciever_fullname: `${flash.fullname}`,
              reciever_username: `${flash.username}`,
              reciever_isverified: `${flash.isverified}`,
              reciever_pic: `${senderpic}`,
              reciever_id: `${flash._id}`,
            },
            token: mainuser?.notificationtoken,
          };

          await admin
            .messaging()
            .send(msg)
            .then((response) => {
              console.log("Successfully sent message");
            })
            .catch((error) => {
              console.log("Error sending message:", error);
            });
        }
        credeli({
          oid: order.orderId,
          id: user._id,
          storeids: sellers,
          total: order.total,
          instant: false,
        });
      }

      await User.updateOne(
        { _id: user._id },
        { $unset: { cart: [], cartproducts: [] } }
      );

      res.status(200).json({ success: true });
    } else {
      res
        .status(404)
        .json({ message: "User or Product not found!", success: false });
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};

//to create delivery
const credeli = async ({ id, storeids, oid, total, instant }) => {
  try {
    const user = await User.findById(id);
    const order = await Order.findOne({ orderId: oid });
    let foodadmount = 7;
    let usualamount = 5;

    let coordinates = [];
    for (let storeid of storeids) {
      const mainstore = await User.findById(storeid);
      let store = mainstore.storeAddress || mainstore.storeAddress[0];

      coordinates.push({
        latitude: store?.coordinates?.latitude,
        longitude: store?.coordinates?.longitude,
        address: store,
        id: mainstore._id,
      });
    }

    //sorting locations
    const sortedCoordinates = geolib.orderByDistance(
      {
        latitude: user.address.coordinates.latitude,
        longitude: user.address.coordinates.longitude,
      },
      coordinates
    );

    const deliverypartners = await Deluser.findOne({
      accounttype: "partner",
      // primaryloc: user.address.city,
    });

    let drop = "ad";
    const newDeliveries = new Delivery({
      title: user?.fullname,
      amount: total,
      orderId: oid,
      pickupaddress: sortedCoordinates[0].address,
      partner: deliverypartners?._id,
      droppingaddress: user?.address,
      phonenumber: user.phone,
      mode: order.paymentMode ? order?.paymentMode : "Cash",
      earning: 20,
      where: "customer",
      data: order.data,
      currentstatus: "pick",
    });

    await newDeliveries.save();

    //pushing delivery for driver
    await Deluser.updateOne(
      { _id: deliverypartners._id },
      { $push: { deliveries: newDeliveries._id } }
    );

    const msg = {
      notification: {
        title: "A new delivery has arrived.",
        body: `From ${user?.fullname} OrderId #${oid}`,
      },
      data: {},
      tokens: [
        deliverypartners?.notificationtoken,
        // user?.notificationtoken,
        // store?.notificationtoken, //person who selles this item
      ],
    };

    await admin
      .messaging()
      .sendEachForMulticast(msg)
      .then((response) => {
        console.log("Successfully sent message");
      })
      .catch((error) => {
        console.log("Error sending message:", error);
      });
    console.log("Booked Instant");
  } catch (e) {
    console.log(e, "Cannot assign delivery");
  }
};
