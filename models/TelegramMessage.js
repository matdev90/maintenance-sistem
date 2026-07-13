const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TelegramMessage = sequelize.define('TelegramMessage', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ref_type: { type: DataTypes.STRING(20), allowNull: false },
  ref_id: { type: DataTypes.INTEGER, allowNull: false },
  chat_id: { type: DataTypes.STRING(50), allowNull: false },
  message_id: { type: DataTypes.INTEGER, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'telegram_messages',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at'
});

module.exports = TelegramMessage;
