const { Notification } = require('../models');

exports.pollUnread = async (req, res) => {
  if (!req.user) return res.json({ count: 0, data: [] });
  const notifs = await Notification.findAll({
    where: { id_user: req.user.id, is_read: false },
    order: [['created_at', 'DESC']],
    limit: 20
  });
  const format = notifs.map(n => ({
    id: n.id,
    title: n.title,
    message: n.message,
    link: n.link,
    created_at: n.created_at
  }));
  res.json({ count: format.length, data: format });
};

exports.markRead = async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false });
  const { id } = req.params;
  if (id === 'all') {
    await Notification.update({ is_read: true }, {
      where: { id_user: req.user.id, is_read: false }
    });
  } else {
    await Notification.update({ is_read: true }, {
      where: { id, id_user: req.user.id }
    });
  }
  res.json({ ok: true });
};

exports.count = async (req, res) => {
  if (!req.user) return res.json({ count: 0 });
  const count = await Notification.count({
    where: { id_user: req.user.id, is_read: false }
  });
  res.json({ count });
};
