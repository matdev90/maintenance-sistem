const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TicketHistory = sequelize.define('TicketHistory', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_ticket: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(50), allowNull: false },
  catatan: { type: DataTypes.TEXT, allowNull: true },
  id_user: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'ticket_histories',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at'
});

module.exports = TicketHistory;
