const User = require("../models/userAuth");
const Conversation = require("../models/conversation");

exports.verifydm = async (req, res) => {
    try {
      const { userId } = req.params;
      const currentDay = Date.now();
      const user = await User.findById(userId).select("dm memberships");
    
      const end = user.memberships.ending;
      const membershipEndingDate = new Date(user.memberships.ending);
      if (user) {
        if (currentDay > membershipEndingDate.getTime() || end === "infinite") {
          res.status(200).json({ message: "DM not available" });
        } else {
          res.status(200).json({
            message: "DM available",
            dm: user?.dm,
          });
        }
      } else {
        res.status(404).json({
          message: "User doesn't exist",
        });
      }
    } catch (e) {
      res.status(400).json({ message: e.message, success: false });
    }
  };

  exports.reducedm = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId).select("dm").lean();

        if (!user) {
            return res.status(404).json({ message: "User doesn't exist" });
        }

        if (user.dm > 0) {
            await User.updateOne({ _id: userId }, { $inc: { dm: -1 } });
            return res.status(200).json({ message: "DM reduced" });
        } else {
            return res.status(200).json({ message: "DM not available" });
        }
    } catch (e) {
        return res.status(400).json({ message: e.message || "An error occurred" });
    }
};
  
exports.createconv = async (req, res) => {
    const { sender, reciever } = req.params;

    try {
        const [conv, user] = await Promise.all([
            Conversation.findOne({ members: { $all: [sender, reciever] } }),
            User.findById(reciever).select("messagerequests") // Select only needed fields
        ]);

        if (conv) {
            return res.status(203).json({ success: false, covId: conv._id });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        await Promise.all([
            User.updateOne(
                { _id: reciever },
                { $pull: { messagerequests: { id: sender } } }
            ),
            User.updateOne(
                { _id: sender },
                { $pull: { msgrequestsent: { id: reciever } } }
            )
        ]);

        const newConv = new Conversation({ members: [sender, reciever] });
        const savedConv = await newConv.save();

        await Promise.all([
            User.updateOne(
                { _id: sender },
                { $push: { conversations: savedConv._id } }
            ),
            User.updateOne(
                { _id: reciever },
                { $push: { conversations: savedConv._id } }
            )
        ]);

        return res.status(200).json({ convId: savedConv._id, success: true });

    } catch (e) {
        return res.status(500).json({ message: e.message, success: false });
    }
};
