const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TicketTechnician = sequelize.define('TicketTechnician', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_ticket: { type: DataTypes.INTEGER, allowNull: false },
  id_user: { type: DataTypes.INTEGER, allowNull: false },
  role: { type: DataTypes.ENUM('utama', 'pendukung'), defaultValue: 'pendukung' },
  added_by: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'removed'), defaultValue: 'active' }
}, {
  tableName: 'ticket_technicians',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = TicketTechnician;