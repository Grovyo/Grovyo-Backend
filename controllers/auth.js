const { decryptaes, encryptaes } = require("../helpers/utils");
const User = require("../models/userAuth");
const Msgs = require("../models/message");
const {
  URL,
  BUCKET_NAME,
  GEOCODE,
  PRODUCT_URL,
  POST_URL,
  CLIENTID,
  CLIENTSECRET,
} = require("../helpers/config");
const Interest = require("../models/Interest");
const s3 = require("../helpers/s3.config");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const Notifications = require("../models/notification");
const Conversation = require("../models/conversation");
const uuid = require("uuid").v4;
const Community = require("../models/community");
const Product = require("../models/product");
const Post = require("../models/post");
const Tag = require("../models/Tags");
const Topic = require("../models/topic");
const Message = require("../models/message");
const admin = require("../fireb");
const Report = require("../models/reports");
const axios = require("axios");
const { UserDetail } = require("otpless-node-js-auth-sdk");

exports.checkemail = async (req, res) => {
  const { email, password, time, type, contacts, loc, device, token } =
    req.body;

  try {
    // Use .lean() to get a plain JavaScript object
    const user = await User.findOne({ email: email })
      .select(
        "_id fullname username passw profilepic phone desc email isverified"
      )
      .lean();

    if (!user) {
      return res.status(203).json({
        message: "No user found with that email",
        success: true,
        userexists: false,
      });
    }

    const pass = decryptaes(user?.passw) || null;
    if (password === pass.toString()) {
      const pic = URL + user.profilepic;

      const newEditCount = {
        time: time,
        deviceinfo: device,
        type: type,
        location: loc,
      };

      await User.updateOne(
        { _id: user._id },
        {
          $push: { activity: newEditCount },
          $addToSet: { contacts: contacts },
          $set: { notificationtoken: token },
        }
      );

      res.status(200).json({
        user: {
          _id: user._id,
          fullname: user.fullname,
          username: user.username,
          phone: user.phone,
          desc: user.desc,
          email: user.email,
          isverified: user.isverified,
        },
        pic,
        success: true,
        userexists: true,
      });
    } else {
      res.status(201).json({
        message: "Incorrect password",
        success: false,
        userexists: true,
      });
    }
  } catch (e) {
    console.log(e);
    res.status(500).json({
      message: "Something went wrong...",
      success: false,
    });
  }
};

exports.verifytoken = async (req, res) => {
  try {
    const { token, type } = req.body;

    const userDetail = await UserDetail.verifyToken(
      token,
      CLIENTID,
      CLIENTSECRET
    );

    if (!userDetail) {
      return res.status(404).json({ success: false });
    }

    let user;
    let identifier;

    if (type === "phone") {
      const number = userDetail?.phone_number?.replace(/^\+/, "");

      user = await User.findOne({ phone: number }).select(
        "profilepic fullname username desc isverified phone email"
      );

      identifier = userDetail?.phone_number;
    } else {
      user = await User.findOne({ email: userDetail?.email }).select(
        "profilepic fullname username desc isverified phone email"
      );
      identifier = userDetail?.email;
    }

    const response = {
      message: user
        ? "User exists, signup via mobile success"
        : "Signup via mobile success",
      user,
      userexists: !!user,
      success: true,
      identifier,
    };

    if (user) {
      response.a = URL + user.profilepic;
    }

    return res.status(200).json(response);
  } catch (e) {
    console.log(e);
    return res.status(400).json({ success: false });
  }
};

exports.signout = async (req, res) => {
  const { id } = req.params;
  const { time, device, type, loc } = req.body;

  try {
    const newEditCount = {
      time: time,
      deviceinfo: device,
      type: type,
      location: loc,
    };
    await User.updateOne(
      { _id: id },
      {
        $push: { activity: newEditCount },
        $set: { notificationtoken: "" },
      }
    );
    res.status(200).json({ success: true });
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.getdp = async (req, res) => {
  console.log("first");

  const { userId } = req.params;
  try {
    const user = await User.findById(userId)
      // Find the user by id and select only the necessary fields
      .select("profilepic conversations guide status")
      .lean();

    if (!user) {
      return (
        res
          // If the user is not found, return a 404 status code with a message
          .status(404)
          .json({ message: "User not found", success: false })
      );
    }

    const dp = URL + user.profilepic;
    // Construct the URL for the display picture
    const isbanned = user.status === "Block";

    // Check if the user is banned

    const unread = await Promise.all(
      // Count the number of unread messages in all the conversations that the user is a part of
      user.conversations.map(async (convId) => {
        const msgCount = await Msgs.countDocuments({
          // Count the number of messages in the conversation that are not read by the user
          conversationId: convId,
          status: "active",
          readby: { $nin: [userId] },
        }).lean();
        return msgCount;
      })
    ).then((results) => results.reduce((sum, count) => sum + count, 0));

    res
      // Return the display picture, ban status, and unread count in the response
      .status(200)
      .json({ success: true, dp, isbanned, unread, guide: user.guide });
  } catch (e) {
    console.log(e);
    // If an error occurs, log the error and return a 400 status code with a message
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.signupmobile = async (req, res) => {
  const { phone, loc, device, contacts, type, time, token } = req.body;

  try {
    const user = await User.findOneAndUpdate(
      { phone },
      {
        $push: { activity: { time, deviceinfo: device, type, location: loc } },
        $addToSet: { contacts },
        $set: { notificationtoken: token },
      },
      {
        new: true,
        select:
          "_id fullname username passw profilepic phone desc email isverified",
        lean: true,
      }
    );

    if (user) {
      const a = URL + user.profilepic;
      res.status(200).json({
        message: "user exists signup via mobile success",
        user: {
          _id: user._id,
          fullname: user.fullname,
          username: user.username,
          phone: user.phone,
          desc: user.desc,
          email: user.email,
          isverified: user.isverified,
        },
        userexists: true,
        a,
        success: true,
      });
    } else {
      res.status(200).json({
        message: "signup via mobile success",
        userexists: false,
        success: true,
      });
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.updatenotification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.body;

    const result = await User.findByIdAndUpdate(
      userId,
      { $set: { notificationtoken: token } },
      { new: true }
    );

    if (result) {
      res.status(200).json({ success: true });
    } else {
      res.status(203).json({ message: "Updation failed", success: false });
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.returnuser = async (req, res) => {
  try {
    // If the user is not found, return a 404 status code
    const { id } = req.params;
    const user = await User.findById(id)
      .select("profilepic email desc phone")
      .lean();

    if (user) {
      const dp = URL + user.profilepic;

      res.status(200).json({ user, dp, success: true });
    } else {
      res.status(404).json({ message: "User not found", success: false });
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.fetchinterest = async (req, res) => {
  try {
    // Fetch interests with count greater than 0
    const interests = await Interest.find({ count: { $gt: 0 } });

    if (!interests || interests.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No interests found" });
    }

    // Merge titles and URLs in a single iteration
    const merged = interests.map((interest) => ({
      f: interest.title,
      dp: `${URL}${interest.pic}.png`,
    }));

    res.status(200).json({ success: true, interests: merged });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message, success: false });
  }
};

exports.postguide = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("guide").lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User Not Found!" });
    }

    await User.updateOne({ _id: id }, { $set: { guide: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message, success: false });
  }
};

exports.updateaccount = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullname,
      username,
      mobile,
      email,
      bio,
      social,
      socialtype,
      time,
      device,
      type,
      loc,
      snap,
      insta,
      x,
      yt,
      linkdin,
    } = req.body;

    // Prepare updates and new activity data
    const updates = {
      fullname,
      username,
      phone: mobile,
      email,
      desc: bio,
      snap,
      insta,
      x,
      yt,
      linkdin,
    };

    const newEditCount = {
      time,
      deviceinfo: device,
      type,
      location: loc,
    };

    // If a file is uploaded, handle S3 upload and set the profile picture
    if (req.file) {
      const uuidString = uuid();
      const objectName = `${Date.now()}_${uuidString}_${req.file.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: objectName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      updates.profilepic = objectName; // Add profile picture to updates
    }

    // Perform the update operation
    await User.updateOne(
      { _id: id },
      {
        $set: updates,
        $push: {
          links: social,
          linkstype: socialtype,
          activity: newEditCount,
        },
      }
    );

    // Construct the profile picture URL if a file was uploaded
    const dp = req.file ? `${URL}${updates.profilepic}` : null;

    res.status(200).json({ dp, success: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};

exports.checkusername = async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username }).select("username").lean();
  try {
    if (user) {
      return res.status(200).json({
        message: "username exists",
        userexists: true,
        success: true,
      });
    } else {
      return res.status(200).json({
        message: "username does not exist",
        userexists: false,
        success: true,
      });
    }
  } catch (e) {
    res.status(500).json({ message: e.message, success: false });
  }
};

exports.fetchnoti = async (req, res) => {
  const { id } = req.params;

  try {
    const notifications = await Notifications.find({ recId: id }).limit(50);

    const notis = notifications.map((notification) => ({
      ...notification.toObject(),
      dp: `${URL}${notification.dp}`,
    }));

    res.status(200).json({ success: true, notis });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res
      .status(400)
      .json({ success: false, message: "Failed to fetch notifications" });
  }
};

exports.fcom = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("communitycreated").lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Use Promise.all to fetch all community data concurrently
    const comdata = await Promise.all(
      user.communitycreated.map(async (comId) => {
        const community = await Community.findById(comId).select(
          "dp title memberscount isverified _id"
        );
        if (community) {
          return {
            dp: `${URL}${community.dp}`,
            title: community.title,
            id: community._id,
            isverified: community.isverified,
            members: community.memberscount,
          };
        }
        return null; // Return null if community is not found
      })
    );

    // Filter out any null values from the results
    const filteredComdata = comdata.filter((data) => data !== null);

    res.status(200).json({ success: true, comdata: filteredComdata });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, message: "Something went wrong" });
  }
};

exports.fconv = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("conversations").lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Use Promise.all to handle all conversations concurrently
    const convResults = await Promise.all(
      user.conversations.map(async (conversationId) => {
        const conv = await Conversation.findById(conversationId).populate(
          "members",
          "fullname username profilepic isverified blockedpeople"
        );

        // If conv is null, skip to the next iteration
        if (!conv) return null;

        // Filter and map members to create result objects
        const results = await Promise.all(
          conv.members.map(async (member) => {
            if (member._id.toString() !== user._id.toString()) {
              const profilePicUrl = `${URL}${member.profilepic}`;

              // Check if the current user is blocked by the member
              const otherUser = await User.findById(member._id).select(
                "blockedpeople"
              );
              const isBlocked = otherUser?.blockedpeople.some(
                (blocked) => blocked.id.toString() === id
              );

              // Return member details only if not blocked
              return !isBlocked
                ? {
                    convid: conv._id,
                    id: member._id,
                    fullname: member.fullname,
                    username: member.username,
                    isverified: member.isverified,
                    pic: profilePicUrl,
                  }
                : null;
            }
            return null;
          })
        );

        // Filter out null results from the members mapping
        return results.filter((result) => result !== null);
      })
    );

    // Flatten the array and remove any null values
    const conv = convResults.flat().filter((item) => item !== null);

    res.status(200).json({ success: true, conv });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, message: "Something went wrong" });
  }
};

exports.updateaddress = async (req, res) => {
  const { userId } = req.params;
  const {
    streetaddress,
    state,
    city,
    landmark,
    pincode,
    latitude,
    longitude,
    altitude,
    provider,
    accuracy,
    bearing,
    phone,
    currentaddress,
    houseno,
  } = req.body;

  try {
    if (!userId) {
      return res.status(404).json({ message: "No user found", success: false });
    }

    let address;

    if (currentaddress) {
      const apiKey = GEOCODE;
      const endpoint = "https://maps.googleapis.com/maps/api/geocode/json";
      const params = {
        address: `${streetaddress} ${city} ${pincode} ${state}`,
        key: apiKey,
      };

      const response = await axios.get(endpoint, { params });

      if (response.data.status !== "OK") {
        console.log("Geocoding API request failed");
        return res
          .status(400)
          .json({ message: "Geocoding API request failed", success: false });
      }

      const location = response.data.results[0].geometry.location;

      address = {
        houseno: houseno,
        streetaddress: currentaddress.split(",")[0].trim(),
        state: currentaddress.split(",")[4].trim().split(" ")[0].trim(),
        city: `${currentaddress.split(",")[2].trim()}, ${currentaddress
          .split(",")[3]
          .trim()}`,
        landmark: landmark || "",
        pincode: currentaddress.split(",")[4].trim().split(" ")[1].trim(),
        coordinates: {
          latitude: location.lat,
          longitude: location.lng,
          altitude,
          provider,
          accuracy,
          bearing,
        },
      };
    } else {
      address = {
        houseno: houseno,
        streetaddress: streetaddress,
        state: state,
        city: city,
        landmark: landmark,
        pincode: pincode,
        coordinates: {
          latitude,
          longitude,
          altitude,
          provider,
          accuracy,
          bearing,
        },
      };

      if (phone) {
        await User.updateOne({ _id: userId }, { $set: { address, phone } });
      } else {
        await User.updateOne({ _id: userId }, { $set: { address } });
      }
    }

    // Only update the address if the currentaddress is provided
    if (currentaddress) {
      await User.updateOne({ _id: userId }, { $set: { address } });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.forwcc = async (req, res) => {
  try {
    const { convs, coms, postid, productid, id } = req.body;

    // Fetch the necessary data using select to limit fields
    const [user, newpost, product] = await Promise.all([
      User.findById(id).select("_id fullname notificationtoken"),
      Post.findById(postid).select("title desc post tags _id"),
      Product.findById(productid).select("name desc images _id"),
    ]);

    if (newpost && user) {
      // Forward post to communities
      if (coms.length > 0) {
        await Promise.all(
          coms.map(async (comId) => {
            const community = await Community.findById(comId).select(
              "_id title members category"
            );
            if (!community) return;

            const topic = await Topic.findOne({
              community: community._id,
              nature: "post",
              title: "Posts",
            }).select("_id");

            // Create and save the forwarded post
            const post = new Post({
              title: newpost.title,
              desc: newpost.desc,
              community: community._id,
              sender: user._id,
              post: newpost.post,
              tags: newpost.tags,
              topicId: topic._id,
              forwardid: newpost._id,
            });

            const savedpost = await post.save();

            // Updating tags and interests concurrently
            const tagPromises = newpost.tags.map(async (tag) => {
              const t = await Tag.findOne({ title: tag.toLowerCase() });
              const int = await Interest.findOne({ title: community.category });

              if (t) {
                await Promise.all([
                  Tag.updateOne(
                    // Update tags and interests
                    { _id: t._id },
                    { $inc: { count: 1 }, $addToSet: { post: savedpost._id } }
                  ),
                  int &&
                    Interest.updateOne(
                      { _id: int._id },
                      {
                        $inc: { count: 1 },
                        $addToSet: { post: savedpost._id, tags: t._id },
                      }
                    ),
                ]);
              } else {
                const newtag = new Tag({
                  title: tag.toLowerCase(),
                  post: [savedpost._id],
                  count: 1,
                });
                await newtag.save();
                if (int) {
                  await Interest.updateOne(
                    { _id: int._id },
                    {
                      $inc: { count: 1 },
                      $addToSet: { post: savedpost._id, tags: newtag._id },
                    }
                  );
                }
              }
            });

            await Promise.all(tagPromises);

            // Update community and topic
            await Promise.all([
              Community.updateOne(
                { _id: community._id },
                { $push: { posts: savedpost._id }, $inc: { totalposts: 1 } }
              ),
              Topic.updateOne(
                { _id: topic._id },
                { $push: { posts: savedpost._id }, $inc: { postcount: 1 } }
              ),
            ]);

            // Send notifications
            const tokens = community.members
              .filter((u) => u.toString() !== user._id.toString())
              .map(async (memberId) => {
                const member = await User.findById(memberId).select(
                  "notificationtoken"
                );
                return member?.notificationtoken;
              });

            // Send notifications to community members
            const resolvedTokens = (await Promise.all(tokens)).filter(Boolean);
            if (resolvedTokens.length > 0) {
              const link = POST_URL + savedpost.post[0].content;
              const msg = {
                notification: {
                  title: `${community.title} - A new Post is Here!`,
                  body: `${savedpost.title}`,
                },
                data: {
                  screen: "CommunityChat",
                  sender_fullname: `${user?.fullname}`,
                  sender_id: `${user?._id}`,
                  text: `${savedpost.title}`,
                  comId: `${community?._id}`,
                  createdAt: `${new Date()}`,
                  type: "post",
                  link,
                },
                tokens: resolvedTokens,
              };

              await admin
                ?.messaging()
                .sendMulticast(msg)
                .catch((error) => {
                  console.error("Error sending message:", error);
                });
            }
          })
        );
      }

      // Forward post to conversations
      if (convs.length > 0) {
        const mesId = Math.floor(Math.random() * 90000000) + 10000000;
        const timestamp = new Date().toISOString();

        await Promise.all(
          convs.map(async (convoId) => {
            const conversation = await Conversation.findById(convoId).select(
              "_id"
            );
            // Handle post forwarding to conversations
            if (!conversation) return;

            const sequence =
              (await Message.countDocuments({ conversationId: convoId })) + 1;

            const message = new Message({
              text: newpost.title,
              sender: user._id,
              conversationId: convoId,
              typ: "post",
              mesId,
              sequence,
              timestamp,
              forwardid: newpost._id,
              isread: false,
              readby: [user._id],
              content: {
                uri: newpost.post[0].content,
                type: newpost.post[0].type,
              },
            });

            await message.save();
          })
        );
      }

      return res.status(200).json({ success: true });
    }

    // Handling product forwarding
    if (product && user) {
      if (coms.length > 0) {
        await Promise.all(
          coms.map(async (comId) => {
            const community = await Community.findById(comId).select(
              "_id title members"
            );
            if (!community) return;

            // Handle product forwarding to communities
            const topic = await Topic.findOne({
              community: community._id,
              nature: "post",
              title: "Posts",
            }).select("_id");

            const post = new Post({
              title: product.name,
              desc: product.desc,
              community: community._id,
              sender: user._id,
              post: product.images,
              topicId: topic._id,
              kind: "product",
              forwardid: product._id,
            });

            const savedpost = await post.save();

            await Promise.all([
              Community.updateOne(
                { _id: community._id },
                { $push: { posts: savedpost._id }, $inc: { totalposts: 1 } }
              ),
              Topic.updateOne(
                { _id: topic._id },
                { $push: { posts: savedpost._id }, $inc: { postcount: 1 } }
                // Update community and topic
              ),
            ]);

            // Send notifications
            const tokens = community.members
              .filter((u) => u.toString() !== user._id.toString())
              .map(async (memberId) => {
                const member = await User.findById(memberId).select(
                  "notificationtoken"
                );
                return member?.notificationtoken;
              });

            // Send notifications to community members
            const resolvedTokens = (await Promise.all(tokens)).filter(Boolean);
            if (resolvedTokens.length > 0) {
              const link = PRODUCT_URL + savedpost.post[0].content;
              const msg = {
                notification: {
                  title: `${community.title} - Posted!`,
                  body: `${savedpost.title}`,
                },
                data: {
                  screen: "CommunityChat",
                  sender_fullname: `${user?.fullname}`,
                  sender_id: `${user?._id}`,
                  text: `${savedpost.title}`,
                  comId: `${community?._id}`,
                  createdAt: `${new Date()}`,
                  type: "post",
                  link,
                },
                tokens: resolvedTokens,
              };

              await admin
                ?.messaging()
                .sendMulticast(msg)
                .catch((error) => {
                  console.error("Error sending message:", error);
                });
            }
          })
        );
      }

      if (convs.length > 0) {
        const mesId = Math.floor(Math.random() * 90000000) + 10000000;
        const timestamp = new Date().toISOString();

        await Promise.all(
          convs.map(async (convoId) => {
            const conversation = await Conversation.findById(convoId).select(
              "_id"
            );
            if (!conversation) return;
            // Handle product forwarding to conversations

            const sequence =
              (await Message.countDocuments({ conversationId: convoId })) + 1;

            const message = new Message({
              text: product.name,
              sender: user._id,
              conversationId: convoId,
              typ: "product",
              mesId,
              sequence,
              timestamp,
              forwardid: product._id,
              isread: false,
              readby: [user._id],
              content: {
                uri: product.images[0].content,
                type: product.images[0].type,
              },
            });

            await message.save();
          })
        );
      }

      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ success: false, message: "Nothing found" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

exports.reporting = async (req, res) => {
  try {
    const { userid } = req.params;
    const { data, id, type } = req.body;

    if (!userid) {
      res.status(404).json({ message: "User not found", success: false });
    } else {
      const report = new Report({
        senderId: userid,
        desc: data,
        reportedid: { id: id, what: type },
      });
      await report.save();
      res.status(200).json({ success: true });
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false, message: "Something went wrong" });
  }
};

exports.passexist = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("passcode").lean();
    if (!user) {
      res.status(404).json({ message: "User not found", success: false });
    } else {
      if (user.passcode) {
        res.status(200).json({ success: true, exists: true });
      } else {
        res.status(200).json({ success: true, exists: false });
      }
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.ispasscorrect = async (req, res) => {
  try {
    const { id } = req.params;
    const { pass } = req.body;
    const user = await User.findById(id).select("passcode").lean();
    if (!user) {
      res.status(404).json({ message: "User not found", success: false });
    } else {
      if (user.passcode === pass) {
        res.status(200).json({ success: true, correct: true });
      } else {
        res.status(200).json({ success: true, correct: false });
      }
    }
  } catch (e) {
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.changepass = async (req, res) => {
  try {
    const { email, pass } = req.body;
    const check = await User.exists({ email: email });
    if (check) {
      const givepass = encryptaes(pass);
      await User.updateOne(
        { _id: check._id },
        { $set: { secretcode: givepass } }
      );
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ success: false, message: "User not found!" });
    }
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};

exports.magiccode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const check = await User.exists({ email: email });

    if (check) {
      const usercode = decryptaes(check?.secretcode?.toString());

      if (code === usercode) {
        res.status(200).json({ success: true });
      } else {
        res.status(203).json({ success: false, message: "Invalid code" });
      }
    } else {
      res.status(404).json({ success: false, message: "User not found!" });
    }
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.intrestcoms = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("interest").lean();
    if (user) {
      const coms = await Community.find({
        category: { $in: user.interest },
        memberscount: { $gte: 53 },
      })
        .select("title memberscount dp _id")
        .limit(10)
        .exec();

      const communities = coms.map(({ title, memberscount, dp, _id }) => ({
        name: title,
        members: memberscount,
        dp: `${URL}${dp}`,
        id: _id,
      }));

      res.status(200).json({
        success: true,
        data: communities,
      });
    } else {
      console.log("User not found");

      res.status(404).json({ message: "User not found", success: false });
    }
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};

exports.joinmasscoms = async (req, res) => {
  try {
    const { id, list } = req.body;

    // Fetch user with only the required fields
    const user = await User.findById(id).select(
      "_id communityjoined totalcom topicsjoined totaltopics"
    );
    if (!user) {
      return res.status(403).json({ success: false });
    }

    // Use `Promise.all` to fetch all communities in parallel
    const communities = await Promise.all(
      list.map((communityId) =>
        Community.findById(communityId).select(
          "_id type topics memberscount notifications"
        )
      )
    );

    // Check for missing communities
    if (communities.some((community) => !community)) {
      return res
        .status(400)
        .json({ message: "One or more communities not found" });
    }

    // Collect updates for user and community in batch
    let userCommunityUpdates = [];
    let topicUpdates = [];
    let topicIdsToJoin = [];

    for (const community of communities) {
      if (community.type === "public") {
        let publicTopics = community.topics.filter((topicId) => {
          // Fetch only the free topics and use select to get minimal fields
          return Topic.findById(topicId)
            .select("_id type")
            .then((topic) => topic && topic.type === "free");
        });

        // Prepare notification object
        const notif = { id: user._id, muted: false };

        // Prepare community update
        userCommunityUpdates.push(
          Community.updateOne(
            { _id: community._id },
            {
              $push: { members: user._id, notifications: notif },
              $inc: { memberscount: 1 },
            }
          )
        );

        // Collect public topic IDs and prepare topic updates
        const topicIds = publicTopics.map((topic) => topic._id);
        topicIdsToJoin = [...topicIdsToJoin, ...topicIds];

        topicUpdates.push(
          Topic.updateMany(
            { _id: { $in: topicIds } },
            {
              $push: { members: user._id, notifications: notif },
              $inc: { memberscount: 1 },
            }
          )
        );
      }
    }

    // Execute all community updates in parallel
    await Promise.all(userCommunityUpdates);

    // Update user community and topics
    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          communityjoined: { $each: list },
          topicsjoined: { $each: topicIdsToJoin },
        },
        $inc: { totalcom: list.length, totaltopics: topicIdsToJoin.length },
      }
    );

    // Execute all topic updates in parallel
    await Promise.all(topicUpdates);

    res.status(200).json({ success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.createnewaccount = async (req, res) => {
  const {
    fullname,
    gender,
    username,
    number,
    bio,
    image,
    interest,
    dob,
    loc,
    device,
    type,
    time,
    token,
  } = req.body;
  const uuidString = uuid();

  const individualInterests = interest.split(",");

  const newEditCount = { time, deviceinfo: device, type, location: loc };

  try {
    let profilepic = image;
    if (req.file) {
      const objectName = `${Date.now()}_${uuidString}_${req.file.originalname}`;

      // Upload image to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: objectName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );
      profilepic = objectName;
    }

    const user = new User({
      fullname,
      username,
      phone: number,
      profilepic,
      desc: bio,
      interest: individualInterests,
      gender,
      DOB: dob,
      gr: 0,
      ismembershipactive: true,
      memberships: {
        membership: "65671e5204b7d0d07ef0e796",
        ending: "infinite",
        status: true,
      },
    });

    await user.save();
    await User.updateOne(
      { _id: user._id },
      {
        $push: { activity: newEditCount },
        $set: { notificationtoken: token },
      }
    );

    // Join default community (Grovyo)
    const comId = "65d313d46a4e4ae4c6eabd15";
    const community = await Community.findById(comId).select("topics");
    const topicIds = community.topics;

    // Fetch all free topics concurrently and filter them
    const topics = await Topic.find({
      _id: { $in: topicIds },
      type: "free",
    }).select("_id");
    const publictopicIds = topics.map((topic) => topic._id);

    // Use Promise.all for concurrent updates
    await Promise.all([
      Community.updateOne(
        { _id: comId },
        { $push: { members: user._id }, $inc: { memberscount: 1 } }
      ),
      User.updateOne(
        { _id: user._id },
        { $push: { communityjoined: community._id }, $inc: { totalcom: 1 } }
      ),
      Topic.updateMany(
        { _id: { $in: publictopicIds } },
        {
          $push: { members: user._id, notifications: user._id },
          $inc: { memberscount: 1 },
        }
      ),
      User.updateOne(
        { _id: user._id },
        { $push: { topicsjoined: publictopicIds }, $inc: { totaltopics: 2 } }
      ),
    ]);

    const pic = URL + user.profilepic;
    res.status(200).json({
      message: "Account created successfully",
      user,
      pic,
      success: true,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      message: "Account creation failed",
      success: false,
    });
  }
};

exports.createnewaccountemail = async (req, res) => {
  const {
    fullname,
    gender,
    username,
    email,
    pass,
    bio,
    image,
    interest,
    dob,
    loc,
    device,
    contacts,
    type,
    time,
    token,
  } = req.body;
  const uuidString = uuid();

  const interestsArray = [interest];
  const interestsString = interestsArray[0];
  const individualInterests = interestsString.split(",");

  const newEditCount = {
    time: time,
    deviceinfo: device,
    type: type,
    location: loc,
  };

  // Encrypting password
  const encrptedpass = encryptaes(pass);

  try {
    let profilepic = image;
    if (req.file) {
      const objectName = `${Date.now()}_${uuidString}_${req.file.originalname}`;

      // Upload image to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: objectName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      profilepic = objectName;
    }
    const user = new User({
      fullname,
      username,
      email,
      passw: encrptedpass,
      profilepic,
      desc: bio,
      interest: individualInterests,
      gender,
      DOB: dob,
    });

    await user.save();
    // Save the user and perform other updates concurrently
    await Promise.all([
      User.updateOne(
        { _id: user._id },
        {
          $push: { activity: newEditCount },
          $addToSet: { contacts },
          $set: { notificationtoken: token },
        }
      ),
      // Update membership information
      User.updateOne(
        { _id: user._id },
        {
          $set: {
            ismembershipactive: true,
            "memberships.membership": "65671e5204b7d0d07ef0e796",
            "memberships.ending": "infinite",
            "memberships.status": true,
          },
        }
      ),
    ]);

    const pic = URL + user.profilepic;

    // Joining community by default (Grovyo)
    const comId = "65d313d46a4e4ae4c6eabd15";
    const community = await Community.findById(comId);

    // Fetch all topics and filter only the free ones
    const publictopic = community.topics.filter(
      async (topicId) => (await Topic.findById(topicId)).type === "free"
    );

    const topicIds = publictopic.map((topic) => topic._id);

    // Use Promise.all to update community and topics concurrently
    await Promise.all([
      Community.updateOne(
        { _id: comId },
        { $push: { members: user._id }, $inc: { memberscount: 1 } }
      ),
      User.updateOne(
        { _id: user._id },
        { $push: { communityjoined: community._id }, $inc: { totalcom: 1 } }
      ),
      Topic.updateMany(
        { _id: { $in: topicIds } },
        {
          $push: { members: user._id, notifications: user._id },
          $inc: { memberscount: 1 },
        }
      ),
      User.updateMany(
        { _id: user._id },
        {
          $push: { topicsjoined: topicIds },
          $inc: { totaltopics: 2 },
        }
      ),
    ]);

    res.status(200).json({
      message: "Account created successfully",
      user,
      pic,
      success: true,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      message: "Account creation failed",
      success: false,
    });
  }
};

exports.interests = async (req, res) => {
  try {
    const userId = req.params.userId;

    const interest = req.body;

    console.log(interest, "interest");

    const updateResult = await User.findByIdAndUpdate(
      userId,
      { $set: { interest: interest } },
      { new: true }
    );

    if (!updateResult) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, interests: updateResult.interest });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
      message: "Failed to update user's interests",
    });
  }
};

exports.newpasscode = async (req, res) => {
  try {
    const { id } = req.params;
    const { pass } = req.body;
    const user = await User.exists({ _id: id });
    if (!user) {
      res.status(404).json({ message: "User not found", success: false });
    } else {
      await User.updateOne({ _id: id }, { $set: { passcode: pass } });
      res.status(200).json({ success: true });
    }
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};
