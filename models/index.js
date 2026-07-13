const sequelize = require('../config/database');
const User = require('./User');
const Unit = require('./Unit');
const DeviceCategory = require('./DeviceCategory');
const Report = require('./Report');
const ReportTracking = require('./ReportTracking');
const Setting = require('./Setting');
const SlaTarget = require('./SlaTarget');
const Notification = require('./Notification');
const Ticket = require('./Ticket');
const TicketHistory = require('./TicketHistory');
const TicketTechnician = require('./TicketTechnician');
const Rating = require('./Rating');
const Asset = require('./Asset');
const TechnicianProfile = require('./TechnicianProfile');
const PreventiveMaintenance = require('./PreventiveMaintenance');
const ShiftSchedule = require('./ShiftSchedule');
const Layanan = require('./Layanan');
const AuditLog = require('./AuditLog');
const TelegramMessage = require('./TelegramMessage');

User.belongsTo(Unit, { foreignKey: 'id_unit', as: 'unit' });

Report.belongsTo(Unit, { foreignKey: 'id_unit', as: 'unit' });
Report.belongsTo(DeviceCategory, { foreignKey: 'id_kategori', as: 'kategori' });
Report.belongsTo(User, { foreignKey: 'id_pelapor', as: 'pelapor' });
Report.belongsTo(User, { foreignKey: 'id_validator', as: 'validator' });
Report.belongsTo(User, { foreignKey: 'id_investigator', as: 'investigator' });
Report.belongsTo(User, { foreignKey: 'id_teknisi', as: 'teknisi' });

Report.hasMany(ReportTracking, { foreignKey: 'id_report', as: 'trackings' });
ReportTracking.belongsTo(Report, { foreignKey: 'id_report', as: 'report' });
ReportTracking.belongsTo(User, { foreignKey: 'id_user', as: 'user' });

Notification.belongsTo(User, { foreignKey: 'id_user', as: 'user' });

Ticket.belongsTo(Unit, { foreignKey: 'id_unit', as: 'unit' });
Ticket.belongsTo(User, { foreignKey: 'id_pelapor', as: 'pelapor' });
Ticket.belongsTo(User, { foreignKey: 'id_teknisi', as: 'teknisi' });
Ticket.belongsTo(DeviceCategory, { foreignKey: 'id_kategori', as: 'kategoriDevice' });
Ticket.hasMany(TicketHistory, { foreignKey: 'id_ticket', as: 'histories' });
Ticket.hasMany(TicketTechnician, { foreignKey: 'id_ticket', as: 'additionalTechnicians' });
TicketHistory.belongsTo(Ticket, { foreignKey: 'id_ticket', as: 'ticket' });
TicketHistory.belongsTo(User, { foreignKey: 'id_user', as: 'user' });

TicketTechnician.belongsTo(Ticket, { foreignKey: 'id_ticket', as: 'ticket' });
TicketTechnician.belongsTo(User, { foreignKey: 'id_user', as: 'user' });
TicketTechnician.belongsTo(User, { foreignKey: 'added_by', as: 'addedBy' });
User.hasMany(TicketTechnician, { foreignKey: 'id_user', as: 'ticketAssignments' });

Rating.belongsTo(User, { foreignKey: 'id_pelapor', as: 'pelapor' });
Rating.belongsTo(Report, { foreignKey: 'id_report', as: 'report' });
Rating.belongsTo(Ticket, { foreignKey: 'id_ticket', as: 'ticket' });
Report.hasOne(Rating, { foreignKey: 'id_report', as: 'rating' });
Ticket.hasOne(Rating, { foreignKey: 'id_ticket', as: 'rating' });

Asset.belongsTo(Unit, { foreignKey: 'id_unit', as: 'unit' });
Asset.belongsTo(DeviceCategory, { foreignKey: 'id_kategori', as: 'kategori' });

TechnicianProfile.belongsTo(User, { foreignKey: 'id_user', as: 'user' });
User.hasOne(TechnicianProfile, { foreignKey: 'id_user', as: 'techProfile' });

ShiftSchedule.belongsTo(User, { foreignKey: 'id_teknisi', as: 'teknisi' });
ShiftSchedule.belongsTo(Layanan, { foreignKey: 'id_layanan', as: 'layanan' });
Layanan.hasMany(DeviceCategory, { foreignKey: 'id_layanan', as: 'kategori' });
DeviceCategory.belongsTo(Layanan, { foreignKey: 'id_layanan', as: 'layanan' });

PreventiveMaintenance.belongsTo(Asset, { foreignKey: 'id_asset', as: 'asset' });
PreventiveMaintenance.belongsTo(DeviceCategory, { foreignKey: 'id_kategori', as: 'kategori' });
PreventiveMaintenance.belongsTo(User, { foreignKey: 'id_teknisi_default', as: 'teknisi' });

module.exports = { sequelize, User, Unit, DeviceCategory, Report, ReportTracking, Setting,
  SlaTarget, Notification, Ticket, TicketHistory, TicketTechnician, Rating, Asset, TechnicianProfile,
  ShiftSchedule, PreventiveMaintenance, Layanan, AuditLog, TelegramMessage };