const Community = require("../models/community");
const User = require("../models/userAuth");
const Membership = require("../models/membership");
const Post = require("../models/post");
const Product = require("../models/product");
const { URL, PRODUCT_URL } = require("../helpers/config");

exports.getbio = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId)
      .select(
        "insta x snap linkdin yt isverified profilepic _id fullname username isblocked blockedby createdAt desc creation"
      )
      .lean();
    if (!user) {
      return res.status(404).json({ message: "No user found", success: false });
    } else {
      res.status(200).json({ data: user, success: true });
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.userprositedetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id)
      .select("prositeweb_template prositemob_template useDefaultProsite")
      .lean();

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    const userDetails = {
      prositemobile: user.prositemob_template,
      prositeweb: user.prositeweb_template,
      useDefaultProsite: user.useDefaultProsite,
    };

    res.status(200).json({ success: true, userDetails });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getcommunities = async (req, res) => {
  const { userId } = req.params;
  const timeLimit = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

  try {
    // Fetch user and membership details with only necessary fields
    const user = await User.findById(userId).select("memberships");
    if (!user)
      return res
        .status(404)
        .json({ message: "User not found", success: false });

    const membership = await Membership.findById(
      user.memberships.membership
    ).select("communitylimit tagging");
    if (!membership)
      return res
        .status(404)
        .json({ message: "Membership not found", success: false });

    // Fetch communities created by the user and populate only members' profile pictures
    const communities = await Community.find({ creator: userId })
      .populate("members", "profilepic")
      .select("dp members memberscount title createdAt");

    if (!communities.length) {
      return res
        .status(404)
        .json({ message: "No community found", success: false });
    }

    // Initialize arrays to store community data
    const dps = communities.map((community) => URL + community.dp);
    const memdps = communities.map((community) =>
      community.members.map((member) => URL + member.profilepic)
    );

    // Fetch recent posts for all communities and check if liked by the user
    const postsData = await Post.find({
      community: { $in: communities.map((c) => c._id) },
      createdAt: { $gte: timeLimit },
    })
      .populate("sender", "fullname")
      .sort({ createdAt: -1 })
      .limit(1)
      .select("post likedby community");

    const posts = [];
    const urls = [];
    const liked = [];

    communities.forEach((community) => {
      const communityPosts = postsData.filter(
        (post) => post.community.toString() === community._id.toString()
      );

      if (communityPosts.length > 0) {
        // Add post URL and liked status
        const post = communityPosts[0];
        posts.push(post);
        urls.push(URL + post.post);
        liked.push(post.likedby.includes(user._id));
      } else {
        posts.push(null);
        urls.push(null);
        liked.push(false);
      }
    });

    res.status(200).json({
      data: {
        community: communities,
        memdps,
        posts,
        dps,
        urls,
        liked,
        limit: membership.communitylimit,
        taglimit: membership.tagging,
      },
      success: true,
    });
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.fetchproducts = async (req, res) => {
  const { userId, mainuserId } = req.params;

  try {
    // Fetch the products and include only necessary fields
    const products = await Product.find({
      creator: userId,
      isverified: "verified",
    })
      .select(
        "isvariant images variants creator name brandname desc price quantity discountedprice _id"
      )
      .populate("creator", "fullname isverified");

    if (!products.length) {
      return res
        .status(203)
        .json({ message: "No products found", success: false });
    }

    // Fetch user details and get the cart items
    const user = await User.findById(mainuserId).select("cart");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    // Create a Set of product IDs in the user's cart for quick lookup
    const productIdsInCart = new Set(
      user.cart.map((item) => item.product?.toString())
    );

    // Process products to build response data
    const mergedData = products.map((product) => {
      const productUrls = [];

      if (product.isvariant) {
        // Collect first images from each variant's category
        product.variants.forEach((variant) => {
          if (variant?.category?.[0]?.content) {
            productUrls.push({
              content: `${PRODUCT_URL}${variant.category[0].content}`,
              type: "image",
            });
          }
        });
      } else {
        // Collect images from the main `images` field
        product.images.forEach((image) => {
          if (image?.content && image?.type) {
            productUrls.push({
              content: `${PRODUCT_URL}${image.content}`,
              type: image.type,
            });
          }
        });
      }

      // Determine if the product is in the user's cart and get the quantity
      const inCart = productIdsInCart.has(product._id.toString());
      const quantity =
        user.cart.find(
          (item) => item.product?.toString() === product._id.toString()
        )?.quantity || 0;

      // Construct and return the product data
      return {
        incart: inCart,
        quantity,
        product,
        urls: productUrls,
      };
    });

    res.status(200).json({ mergedData, success: true });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(400).json({ message: error.message, success: false });
  }
};

exports.getprositedetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { sender, reciever } = req.body;

    // Check if the requested user exists
    const userExists = await User.exists({ _id: id });
    if (!userExists) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Retrieve minimal user details for profile site and specific templates
    const user = await User.findById(id)
      .select(
        "fullname username pic prositemob_template prositeweb_template useDefaultProsite desc"
      )
      .lean();

    const userDetails = {
      prositemobile: user.prositemob_template,
      prositeweb: user.prositeweb_template,
      useDefaultProsite: user.useDefaultProsite,
      bio: user.desc,
    };

    // If sender and receiver are the same, skip conversation and message request checks
    if (sender === reciever) {
      return res.status(200).json({
        success: true,
        existingreq: true,
        existsbothway: true,
        userDetails,
      });
    }

    // Retrieve sender and receiver with necessary fields for request checks
    const [sendingPerson, receivingPerson] = await Promise.all([
      User.findById(sender).select(
        "conversations messagerequests msgrequestsent"
      ),
      User.findById(reciever).select(
        "conversations messagerequests msgrequestsent"
      ),
    ]);

    if (!receivingPerson) {
      return res
        .status(404)
        .json({ success: false, message: "Receiving user not found" });
    }

    // Check if a conversation exists between sender and receiver
    const conversation = await Conversation.findOne({
      members: { $all: [sender, reciever] },
    })
      .populate("members", "fullname username profilepic isverified")
      .sort({ createdAt: -1 });

    let existsBothWays = false;
    if (conversation) {
      // Check if both users have the conversation ID in their conversations list
      existsBothWays =
        sendingPerson.conversations.includes(conversation._id.toString()) &&
        receivingPerson.conversations.includes(conversation._id.toString());

      // Respond based on whether both users have the conversation
      return res.status(200).json({
        success: true,
        conv: conversation,
        existingreq: true,
        existsbothway: existsBothWays,
      });
    }

    // Check for any existing message requests between sender and receiver
    const requestExists =
      receivingPerson.messagerequests.some(
        (req) => req.id.toString() === sender.toString()
      ) ||
      receivingPerson.msgrequestsent.some(
        (req) => req.id.toString() === sender.toString()
      ) ||
      sendingPerson.messagerequests.some(
        (req) => req.id.toString() === reciever.toString()
      ) ||
      sendingPerson.msgrequestsent.some(
        (req) => req.id.toString() === reciever.toString()
      );

    // Respond based on whether a message request already exists
    if (requestExists) {
      return res.status(200).json({ success: true, existingreq: true });
    } else {
      return res
        .status(203)
        .json({ success: true, existingreq: false, userDetails });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
