const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rating = sequelize.define('Rating', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_report: { type: DataTypes.INTEGER, allowNull: true },
  id_ticket: { type: DataTypes.INTEGER, allowNull: true },
  id_pelapor: { type: DataTypes.INTEGER, allowNull: false },
  bintang: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  komentar: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'ratings',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Rating;
