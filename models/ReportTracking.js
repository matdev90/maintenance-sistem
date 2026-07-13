const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReportTracking = sequelize.define('ReportTracking', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_report: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(50), allowNull: false },
  catatan: { type: DataTypes.TEXT, allowNull: true },
  id_user: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'report_trackings',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at'
});

module.exports = ReportTracking;
