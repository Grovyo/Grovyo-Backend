const User = require("../models/userAuth");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const Topic = require("../models/topic");
const Community = require("../models/community");
const Post = require("../models/post");
const { MSG_URL, PRODUCT_URL, POST_URL, URL, MSG_BUCKET } = require("../helpers/config");
const admin = require("../fireb");
const moment = require("moment");
const { v4: uuid } = require("uuid");
const s3 = require("../helpers/s3.config");
const { PutObjectCommand } = require("@aws-sdk/client-s3");

function msgid() {
  return Math.floor(100000 + Math.random() * 900000);
}

function generateRandomCode() {
  const randomNumber = Math.floor(Math.random() * 900000) + 100000;
  const randomCode = randomNumber.toString();
  return randomCode;
}

exports.convexists = async (req, res) => {
  const { sender, reciever } = req.body;
  try {
    const [sendingperson, recievingperson] = await Promise.all([
      User.findById(sender).select(
        "conversations messagerequests msgrequestsent"
      ),
      User.findById(reciever).select(
        "conversations messagerequests msgrequestsent"
      ),
    ]);

    // Check if both users exist
    if (!sendingperson || !recievingperson) {
      return res.status(404).json({
        message: "User not found",
        success: false,
        existingreq: false,
      });
    }

    // Find existing conversation, populated with specific fields
    const conv = await Conversation.findOne({
      members: { $all: [sender, reciever] },
    })
      .populate("members", "fullname username profilepic isverified")
      .sort({ createdAt: -1 });

    // Check if the conversation exists in both users conversation lists
    const existsbothway =
      conv &&
      sendingperson.conversations.includes(conv._id.toString()) &&
      recievingperson.conversations.includes(conv._id.toString());

    // Return response if conversation exists
    if (conv) {
      return res.status(200).json({
        success: true,
        conv,
        existingreq: true,
        existsbothway,
      });
    }

    // Check if a message request already exists in either user’s message request lists
    const senderId = sendingperson._id.toString();
    const receiverId = recievingperson._id.toString();
    const isRequestExist = [
      ...recievingperson.messagerequests,
      ...recievingperson.msgrequestsent,
      ...sendingperson.msgrequestsent,
      ...sendingperson.messagerequests,
    ].some(
      (req) =>
        req.id.toString() === senderId || req.id.toString() === receiverId
    );

    // Return response based on whether a request exists
    return res.status(isRequestExist ? 200 : 203).json({
      success: true,
      existingreq: isRequestExist,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: e.message,
      success: false,
      existingreq: false,
    });
  }
};

exports.fetchconvs = async (req, res) => {
  try {
    const { id, convId, otherid } = req.params;

    const [user, otherperson] = await Promise.all([
      User.findById(id).lean(),
      User.findById(otherid).lean(),
    ]);

    if (!user || !otherperson) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    // Check if either user has blocked the other
    const isBlocked = otherperson.blockedpeople.some(
      (p) => p.id.toString() === user._id.toString()
    );
    const canBlock = user.blockedpeople.some(
      (p) => p.id.toString() === otherperson._id.toString()
    );

    // Fetch messages for the conversation
    const messagesData = await Message.find({
      conversationId: convId,
      deletedfor: { $nin: [user._id.toString()] },
      hidden: { $nin: [user._id.toString()] },
    })
      .limit(20)
      .sort({ createdAt: -1 })
      .populate("sender", "profilepic fullname isverified");

    const messages = await Promise.all(
      messagesData.map(async (msg) => {
        let url;
        switch (msg.typ) {
          case "image":
          case "video":
          case "doc":
          case "glimpse":
            url = `${MSG_URL}${msg.content?.uri}`;
            break;
          case "gif":
            url = msg.content?.uri;
            break;
            case "post": {
            
              const post = await Post.findById(msg.forwardid).select("community");
              url = `${POST_URL}${msg.content?.uri}`;
              return { ...msg.toObject(), url, comId: post?.community };
            }
          case "product":
            url = `${PRODUCT_URL}${msg.content?.uri}`;
            break;
          default:
            url = null; // Default case
        }
        return { ...msg.toObject(), url };
      })
    );

    // Update read status of messages
    const msgIds = messages.map((message) => message.mesId);
    await Message.updateMany(
      { mesId: { $in: msgIds } },
      { $addToSet: { readby: user._id } }
    );

    res.status(200).json({
      canblock: canBlock,
      isblocked: isBlocked,
      messages: isBlocked ? [] : messages.reverse(),
      success: true,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Something went wrong...", success: false });
  }
};

const getUniqueObjectIds = (convids, conversations) => {
  const allIds = [...convids, ...conversations];
  const uniqueIds = [...new Set(allIds.map((id) => id.toString()))];

  // Convert back to ObjectId if needed
  return uniqueIds
};

exports.fetchallchatsnew = async (req, res) => {
  try {
    const { id } = req.params;
    const { convids } = req.body;

    // Find the user and their required fields
    const user = await User.findById(id)
      .select("conversations messagerequests _id muted")
      .lean();
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const reqcount = user.messagerequests?.length || 0;
    const ids =
      convids?.length > 0
        ? getUniqueObjectIds(convids, user.conversations)
        : user.conversations;

    // Find conversations with populated members
    const conversations = await Conversation.find({ _id: { $in: ids } })
      .populate(
        "members",
        "fullname username profilepic isverified blockedpeople"
      )
      .lean();

    const userIds = conversations.flatMap((conv) =>
      conv.members.map((member) => member._id)
    );
    const otherUsers = await User.find({ _id: { $in: userIds } })
      .select("fullname username profilepic isverified blockedpeople")
      .lean();

    const otherUsersMap = new Map();
    otherUsers.forEach((other) => {
      otherUsersMap.set(other._id.toString(), other);
    });

    // Prepare conversation data
    const conv = await Promise.all(
      conversations.map(async (convs) => {
        const otherMember = convs.members.find(
          (member) => member._id.toString() !== id
        );
        if (!otherMember) return null; // Skip if no other member

        const pi = URL + otherMember.profilepic;
        const otherUser = otherUsersMap.get(otherMember._id.toString());

        // Check for blocked status
        const isBlocked =
          otherUser &&
          Array.isArray(otherUser.blockedpeople) &&
          otherUser.blockedpeople.includes(id);

        // Fetch latest message in the conversation
        const [msg] = (await Message.find({
          conversationId: convs._id,
          hidden: { $nin: [id] },
          deletedfor: { $nin: [user._id] },
        })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean()) || [{}]; // Default to empty object if no message found

        // Fetch unread messages count
        const unread = await Message.countDocuments({
          conversationId: convs._id,
          status: "active",
          deletedfor: { $nin: [user._id.toString()] },
          hidden: { $nin: [user._id.toString()] },
          readby: { $nin: [id] },
          sender: { $ne: id },
        });

        return {
          convid: convs._id,
          id: otherMember._id,
          fullname: otherMember.fullname,
          username: otherMember.username,
          isverified: otherMember.isverified,
          pic: pi,
          msgs: isBlocked ? [] : [msg], // Wrap msg in an array if not blocked
          ismuted: user.muted.some(
            (mutedId) => mutedId.toString() === convs._id.toString()
          ),
          unread,
        };
      })
    );

    // Filter out null values and sort by message timestamp
    const filteredConv = conv
      .filter((c) => c !== null)
      .sort((a, b) => {
        const timeA = a.msgs[0]?.createdAt || 0; // Use optional chaining and default to 0
        const timeB = b.msgs[0]?.createdAt || 0; // Use optional chaining and default to 0
        return timeB - timeA;
      });

    res.status(200).json({ success: true, reqcount, conv: filteredConv });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};

exports.muting = async (req, res) => {
  try {
    const { id, convId } = req.body;

    // Retrieve only the needed fields
    const user = await User.findById(id).select("_id muted").lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found!" });
    }
    const exists = user.muted.some((mutedId) => mutedId.toString() === convId);

    if (exists) {
      await User.updateOne({ _id: user._id }, { $pull: { muted: convId } });
    } else {
      await User.updateOne({ _id: user._id }, { $addToSet: { muted: convId } });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};

exports.removeconversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { convId } = req.body;

    const user = await User.findById(id).select("conversations").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found", success: false });
    }

    const updatedConversations = user.conversations.filter(conv => conv.toString() !== convId);

    await User.updateOne(
      { _id: id },
      { $set: { conversations: updatedConversations } }
    );

    res.status(200).json({ success: true, message: "Conversation removed successfully." });
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.fetchallmsgreqs = async (req, res) => {
  const { id } = req.params;

  try {
    // Find the user and populate message requests
    const user = await User.findById(id).select("messagerequests").populate({
      path: "messagerequests.id",
      select: "fullname username isverified profilepic",
    });

    // Check if the user exists and handle error in one place
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Map over the message requests to construct the dps array
    const dps = user.messagerequests.map(request =>
      URL + request.id?.profilepic
    );

    // Respond with the message requests and the constructed dps array
    res.status(200).json({ reqs: user.messagerequests, dps, success: true });
  } catch (e) {
    // Handle server error
    res.status(500).json({ message: e.message, success: false });
  }
};

exports.acceptorrejectmesgreq = async (req, res) => {
  const { sender, status, reciever } = req.body;
  try {
    // Find the conversation if it exists
    const conv = await Conversation.findOne({
      members: { $all: [sender, reciever] },
    });

    // Find the user and select only necessary fields
    const user = await User.findById(reciever).select('_id messagerequests');

    if (conv) {
      return res.status(203).json({ success: false, covId: conv._id });
    } else if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Common updates for both accept and reject cases
    const pullRequests = Promise.all([
      User.updateOne({ _id: reciever }, { $pull: { messagerequests: { id: sender } } }),
      User.updateOne({ _id: sender }, { $pull: { msgrequestsent: { id: reciever } } })
    ]);

    if (status === "accept") {
      const newConv = new Conversation({ members: [sender, reciever] });
      const savedconv = await newConv.save();

      // Update users' conversations in parallel
      await Promise.all([
        User.updateOne({ _id: sender }, { $push: { conversations: savedconv._id } }),
        User.updateOne({ _id: reciever }, { $push: { conversations: savedconv._id } })
      ]);

      // Await the result of the pull operations
      await pullRequests;

      return res.status(200).json({ savedconv, success: true });
    } else {
      // If the request is rejected, await the pull operations
      await pullRequests;
      return res.status(200).json({ success: true });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message, success: false });
  }
};

exports.fetchmorehiddenconv = async (req, res) => {
  try {
    const { id } = req.params;
    const { convId, sequence } = req.body;

    // Find the user and handle the case if not found
    const user = await User.findById(id).select("profilepic fullname isverified");
    if (!user) {
      return res.status(404).json({ message: "User not found!", success: false });
    }

    // Calculate the sequence range
    const gt = parseInt(sequence) - 1;
    const lt = gt - 10;

    // Fetch messages concurrently and process them
    const messages = await Message.find({
      conversationId: convId,
      status: "active",
      hidden: { $in: [user._id.toString()] },
      deletedfor: { $nin: [user._id] },
      sequence: { $gte: lt, $lte: gt },
    })
      .limit(20)
      .sort({ sequence: 1 })
      .populate("sender", "profilepic fullname isverified");

    // Process messages and generate the response
    const formattedMessages = messages.map(msg => {
      const messageData = msg.toObject();
      if (messageData.typ === "image" || messageData.typ === "video" || messageData.typ === "doc") {
        const url = MSG_URL + messageData.content?.uri;
        return { ...messageData, url };
      }
      return messageData;
    });

    return res.status(200).json({ messages: formattedMessages, success: true });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ success: false });
  }
};

exports.blockpeople = async (req, res) => {
  try {
    const { id } = req.params;
    const { userid, time } = req.body;

    const user = await User.findById(id).select("blockedpeople").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found", success: false });
    }

    // Check if the user is already blocked
    const isBlocked = user.blockedpeople.some(blockedUser => blockedUser.id.toString() === userid);

    // If the user is already blocked, remove them
    if (isBlocked) {
      await User.updateOne(
        { _id: id },
        {
          $pull: { blockedpeople: { id: userid } }
        }
      );
      return res.status(200).json({ success: true, message: "User unblocked" });
    }

    await User.updateOne(
      { _id: id },
      {
        $addToSet: {
          blockedpeople: { id: userid, time },
        },
      }
    );

    return res.status(200).json({ success: true, message: "User blocked" });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: "Something went wrong", success: false });
  }
};

exports.loadmoremessages = async (req, res) => {
  try {
    const { id, topicId, sequence } = req.params;

    // Use `Promise.all` to fetch topic and community data concurrently
    const [topic, community] = await Promise.all([
      Topic.findById(topicId).select("type members memberscount price message"),
      Community.findOne({ topics: topicId }).select("members"),
    ]);

    if (!topic || !community || !id) {
      return res.status(404).json({ message: "Something not found", success: false });
    }

    // Check if the user is a member of the community
    if (!community.members.some((member) => member.toString() === id)) {
      return res.status(203).json({
        message: "You are not the member of the Community",
        success: true,
        topicjoined: false,
      });
    }

    // Check if the user needs to join the topic
    if (topic.type === "paid" && !topic.members.some((memberId) => memberId.toString() === id)) {
      return res.status(203).json({
        message: "You need to join the topic first",
        success: true,
        topicjoined: false,
        id: topic._id,
        price: topic.price,
        desc: topic.message,
        members: topic.memberscount,
      });
    }

    // Calculate range for sequence
    let gt = parseInt(sequence) - 1;
    let lt = Math.max(gt - 10, 1);

    // Fetch messages with a more efficient query
    const messages = await Message.find({
      topicId: topicId,
      sequence: { $gte: lt, $lte: gt },
      deletedfor: { $nin: [id] },
    })
      .limit(10)
      .sort({ sequence: 1 })
      .populate("sender", "profilepic fullname isverified")
      .lean(); // Use `lean()` to convert documents to plain objects

    // Transform messages
    const transformedMessages = await Promise.all(
      messages.map(async (msg) => {
        let url = null;
        let comId = null;

        if (["image", "video", "doc", "glimpse"].includes(msg.typ)) {
          url = MSG_URL + msg.content?.uri;
        } else if (msg.typ === "gif") {
          url = msg.content?.uri;
        } else if (msg.typ === "post") {
          const post = await Post.findById(msg.forwardid).select("community");
          url = POST_URL + msg.content?.uri;
          comId = post?.community;
        } else if (msg.typ === "product") {
          url = PRODUCT_URL + msg.content?.uri;
        }

        return {
          ...msg,
          url,
          comId,
          dp: URL + msg.sender.profilepic,
        };
      })
    );

    // Reverse messages for display order
    transformedMessages.reverse();

    // Send success response
    res.status(200).json({
      messages: transformedMessages,
      success: true,
      topicjoined: true,
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Something went wrong...", success: false });
  }
};

exports.createmessagereqnew = async (req, res) => {
  try {
    const { sender, message, reciever } = req.body;

    // Fetch both users concurrently, selecting only necessary fields
    const [sendingPerson, receivingPerson] = await Promise.all([
      User.findById(sender).select("conversations blockedpeople fullname isverified notificationtoken"),
      User.findById(reciever).select("conversations blockedpeople messagerequests msgrequestsent")
    ]);

    // Check if users are valid
    if (!sendingPerson || !receivingPerson) {
      return res.status(404).json({ message: "Invalid users", success: false });
    }

    // Check if the conversation exists
    const conv = await Conversation.findOne({ members: { $all: [sender, reciever] } });
    if (conv) {
      return res.status(203).json({ success: true, covId: conv._id, convexists: true });
    }

    // Check if blocked
    if (
      sendingPerson.blockedpeople.some(block => block.id.toString() === reciever) ||
      receivingPerson.blockedpeople.some(block => block.id.toString() === sender)
    ) {
      return res.status(203).json({ message: "You are blocked", success: false });
    }

    // Check if request already exists
    const requestExists = [
      ...sendingPerson.msgrequestsent,
      ...sendingPerson.messagerequests,
      ...receivingPerson.msgrequestsent,
      ...receivingPerson.messagerequests
    ].some(req => req.id.toString() === sender || req.id.toString() === reciever);

    if (requestExists) {
      return res.status(200).json({ success: true, existingreq: true });
    }

    // Update users to add message request
    await Promise.all([
      User.updateOne(
        { _id: reciever },
        { $push: { messagerequests: { id: sender, message: message } } }
      ),
      User.updateOne(
        { _id: sender },
        { $push: { msgrequestsent: { id: reciever } } }
      )
    ]);

    // Prepare message for notification
    const date = moment(new Date()).format("hh:mm");
    const msg = {
      notification: {
        title: "A new request has arrived.",
        body: `👋 Extend your hand and accept!!`,
      },
      data: {
        screen: "Requests",
        sender_fullname: sendingPerson.fullname,
        sender_id: sendingPerson._id.toString(),
        text: "A new request has arrived!!",
        isverified: sendingPerson.isverified.toString(),
        createdAt: date,
      },
      token: receivingPerson.notificationtoken,
    };

    // Send notification
    await admin.messaging().send(msg);
    console.log("Successfully sent message");

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: "Something went wrong", success: false });
  }
};

exports.createmessagereqs = async (req, res) => {
  const { sender, message, reciever } = req.body;

  try {
    // Fetch conversation and users in parallel
    const [conv, sendingPerson, receivingPerson] = await Promise.all([
      Conversation.findOne({ members: { $all: [sender, reciever] } }).select('_id members'),
      User.findById(sender).select('blockedpeople conversations fullname isverified'),
      User.findById(reciever).select('blockedpeople messagerequests msgrequestsent notificationtoken')
    ]);

    // Check if either user has blocked the other
    const isBlocked = sendingPerson.blockedpeople.some(b => b.id.toString() === reciever) ||
      receivingPerson.blockedpeople.some(b => b.id.toString() === sender);

    if (isBlocked) {
      return res.status(201).json({ message: "You are blocked", success: false });
    }

    // Check if the conversation exists in both users' conversations
    const existsBothWays = sendingPerson.conversations?.includes(conv?._id?.toString()) &&
      receivingPerson.conversations?.includes(conv?._id?.toString());

    if (conv) {
      return res.status(203).json({
        success: true,
        covId: conv._id,
        existingreq: false,
        existsbothway: existsBothWays,
        convexists: true,
      });
    }

    // If receiving person is not found
    if (!receivingPerson) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check for existing message requests using a combined array
    const allRequests = [
      ...receivingPerson.messagerequests,
      ...receivingPerson.msgrequestsent,
      ...sendingPerson.msgrequestsent,
      ...sendingPerson.messagerequests
    ];

    const reqExists = allRequests.some(req => req.id.toString() === sender || req.id.toString() === reciever);

    if (reqExists) {
      return res.status(200).json({ success: true, existingreq: true });
    }

    // Create new message request
    await Promise.all([
      User.updateOne(
        { _id: reciever },
        { $push: { messagerequests: { id: sender, message } } }
      ),
      User.updateOne(
        { _id: sender },
        { $push: { msgrequestsent: { id: reciever } } }
      )
    ]);

    // Prepare notification message
    const date = moment().format("hh:mm");
    const notificationMessage = {
      notification: {
        title: "A new request has arrived.",
        body: "👋 Extend your hand and accept!!",
      },
      data: {
        screen: "Requests",
        sender_fullname: sendingPerson.fullname,
        sender_id: sendingPerson._id,
        text: "A new request has arrived!!",
        isverified: sendingPerson.isverified,
        createdAt: date,
      },
      token: receivingPerson.notificationtoken,
    };

    // Send notification
    await admin.messaging().send(notificationMessage);
    res.status(200).json({ success: true, existingreq: false });

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message, success: false, existingreq: false });
  }
};

exports.fetchblocklist = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the user and populate the blocked people with only necessary fields
    const user = await User.findById(id).select("blockedpeople _id").populate({
      path: "blockedpeople.id",
      select: "fullname username profilepic", // Select only necessary fields
    });

    // Check if the user was found
    if (!user) {
      return res.status(404).json({ message: "User not found", success: false });
    }

    // Use Promise.all to process the blocked people's profile pictures
    const dp = await Promise.all(user.blockedpeople.map(async (blocked) => {
      const profilePicUrl = URL + blocked.id.profilepic; // Construct the full URL
      return profilePicUrl;
    }));

    // Respond with the blocklist and profile picture URLs
    res.status(200).json({ blocklist: user.blockedpeople, dp, success: true });

  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Something went wrong", success: false });
  }
};

exports.sendexistingmsg = async (req, res) => {
  try {
    const { convId } = req.params;
    const { sender, reciever } = req.body;

    const [senderperson, recieverperson, conv] = await Promise.all([
      User.findById(sender).select('_id conversations'),
      User.findById(reciever).select('_id conversations'),
      Conversation.findById(convId).select('_id')
    ]);

    if (!senderperson) {
      return res.status(404).json({ message: "User not found", success: false });
    }

    if (!conv) {
      return res.status(404).json({ message: "Conversation not found", success: false });
    }

    if (
      senderperson?.conversations?.includes(conv?._id?.toString()) &&
      recieverperson?.conversations?.includes(conv?._id?.toString())
    ) {
      res.status(200).json({ success: true });
    } else {
      await User.updateOne(
        { _id: senderperson._id },
        {
          $push: {
            conversations: convId,
          },
        }
      );
      res.status(200).json({ success: true });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ message: e.message, success: false });
  }
};

exports.deletemessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { convId, msgIds, action } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    if (action === "everyone") {
      await Message.updateMany(
        { mesId: { $in: msgIds }, conversationId: convId },
        { $set: { status: "deleted" } }
      );
    } else {
      await Message.updateMany(
        { mesId: { $in: msgIds }, conversationId: convId },
        { $push: { deletedfor: id } }
      );
    }
    res.status(200).json({ success: true });

  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

const createMessagePayload = (code, grovyo, user, senderpic, recpic, timestamp, mesId, conv) => {
  return {
    notification: {
      title: `Grovyo`,
      body: `Your code to access your Hidden Chats is ${code}.`,
    },
    data: {
      screen: "Conversation",
      sender_fullname: grovyo.fullname,
      sender_id: grovyo._id,
      text: `Your code to access your Hidden Chats is ${code}.`,
      convId: conv ? conv._id : null,
      createdAt: timestamp,
      mesId: mesId,
      typ: `message`,
      senderuname: grovyo.username,
      senderverification: grovyo.isverified,
      senderpic: senderpic,
      reciever_fullname: user.fullname,
      reciever_username: user.username,
      reciever_isverified: user.isverified,
      reciever_pic: recpic,
      reciever_id: user._id,
    },
    token: user.notificationtoken,
  };
};

const sendNotification = async (msg) => {
  try {
    await admin.messaging().send(msg);
    console.log("Successfully sent message");
  } catch (error) {
    console.log("Error sending message:", error);
  }
};

exports.resethidden = async (req, res) => {
  try {
    const { id } = req.body;

    // Fetch the user and select only the necessary fields
    const user = await User.findById(id).select('profilepic fullname username notificationtoken isverified');

    if (!user) {
      return res.status(404).json({ message: "User not found", success: false });
    }

    // Generate a random code
    let code = generateRandomCode();

    // Update the user's passcode in one go
    await User.updateOne({ _id: user._id }, { $set: { passcode: code } });

    // Fetch Grovyo and the conversation concurrently
    const grovyoId = "65a666a3e953a4573e6c7ecf";
    const [grovyo, conv] = await Promise.all([
      User.findById(grovyoId).select('profilepic fullname username isverified'),
      Conversation.findOne({
        members: { $all: [user._id, grovyoId] },
      }).select('_id')
    ]);

    const senderpic = URL + grovyo.profilepic;
    const recpic = URL + user.profilepic;
    const timestamp = new Date().toISOString(); // Use ISO format for timestamp
    const mesId = msgid();
    let data = {
      conversationId: conv ? conv._id : null,
      sender: grovyo._id,
      text: `Your code to access your Hidden Chats is ${code}.`,
      mesId: mesId,
    };

    // If conversation exists, send the message and notification
    if (conv) {
      const m = new Message(data);
      await m.save();

      if (user.notificationtoken) {
        const msg = createMessagePayload(code, grovyo, user, senderpic, recpic, timestamp, mesId, conv);
        await sendNotification(msg);
      }
    } else {
      // Create a new conversation if it doesn't exist
      const newConv = new Conversation({
        members: [grovyo._id, user._id],
      });
      const savedConv = await newConv.save();

      // Update both users' conversations
      await Promise.all([
        User.updateOne({ _id: grovyo._id }, { $addToSet: { conversations: savedConv._id } }),
        User.updateOne({ _id: user._id }, { $addToSet: { conversations: savedConv._id } }),
      ]);

      data.conversationId = savedConv._id;
      const m = new Message(data);
      await m.save();

      if (user.notificationtoken) {
        const msg = createMessagePayload(code, grovyo, user, senderpic, recpic, timestamp, mesId, savedConv);
        await sendNotification(msg);
      }
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

exports.hideconvmsg = async (req, res) => {
  try {
    const { id } = req.params;
    const { msgid } = req.body;

    const user = await User.exists({ _id: id });
    if (!user) {
      res.status(404).json({ message: "User not found", success: false });
    } else {
      await Message.updateMany(
        { mesId: { $in: msgid } },
        { $push: { hidden: id } }
      );
      res.status(200).json({ success: true });
    }
  } catch (e) {

    res
      .status(400)
      .json({ message: e.message, success: false });
  }
};

exports.loadmorechatmsgs = async (req, res) => {
  try {
    const { id } = req.params;
    const { convId, sequence } = req.body;

    // Check if the user exists
    const userExists = await User.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: "User not found!", success: false });
    }

    // Calculate the sequence range
    const gt = parseInt(sequence) - 1;
    const lt = Math.max(gt - 10, 1); // Ensure lt is at least 1

    // Fetch messages with selected fields
    const messages = await Message.find({
      conversationId: convId,
      sequence: { $gte: lt, $lte: gt },
      deletedfor: { $nin: [id] },
      hidden: { $nin: [id] },
    })
      .limit(10)
      .sort({ sequence: 1 })
      .populate("sender", "profilepic fullname isverified");

    // Map messages to include URLs where necessary
    const formattedMessages = messages.map(msg => {
      const messageData = msg.toObject();
      if (["image", "video", "doc", "gif"].includes(msg.typ)) {
        const url = msg.typ === "gif" ? msg.content.uri : MSG_URL + msg.content.uri;
        return { ...messageData, url };
      }
      return messageData;
    });

    res.status(200).json({ messages: formattedMessages, success: true });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false });
  }
};

exports.sendchatfile = async (req, res) => {
  try {
    const data = JSON.parse(req.body.data) || [];

    let pos = {};
    if (data?.typ !== "gif") {
      const uuidString = uuid();

      const objectName = `${Date.now()}_${uuidString}_${req.files[0].originalname
        }`;

      await s3.send(
        new PutObjectCommand({
          Bucket: MSG_BUCKET,
          Key: objectName,
          Body: req.files[0].buffer,
          ContentType: req.files[0].mimetype,
        })
      );
      pos.uri = objectName;
      pos.type = req.files[0].mimetype;
      pos.name = data?.content?.name;
      pos.size = req.files[0].size;
    } else {
      pos.uri = data?.url;
      pos.type = "image/gif";
    }

    const message = new Message({
      text: data?.text,
      sender: data?.sender_id,
      conversationId: data?.convId,
      typ: data?.typ,
      mesId: data?.mesId,
      reply: data?.reply,
      dissapear: data?.dissapear,
      isread: data?.isread,
      sequence: data?.sequence,
      timestamp: data?.timestamp,
      content: pos,
      comId: data?.comId,
      topicId: data?.sendtopicId,
    });
    await message.save();

    let a;
    if (data?.typ !== "gif") {
      a = MSG_URL + message?.content?.uri;
    } else {
      a = URL + message?.content?.uri;
    }

    res.status(200).json({ success: true, link: a });
  } catch (e) {
    console.log(e);
    res
      .status(400)
      .json({ message: "Something went wrong...", success: false });
  }
};