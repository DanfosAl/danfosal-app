/**
 * Weekly Report Automation Service
 * 
 * Automatically generates Executive PDF Reports every Monday at 08:00 AM
 * Saves to: C:\Danfosal\Reports\Weekly\
 * Optional email notifications via Nodemailer
 */

const cron = require('node-cron');
const path = require('path');
const fs = require('fs-extra');
const nodemailer = require('nodemailer');
const PDFExportService = require('./export-pdf');

class WeeklyReportScheduler {
  constructor() {
    this.outputDir = 'C:\\Danfosal\\Reports\\Weekly';
    this.logFile = path.join(__dirname, 'logs', 'weekly-scheduler.log');
    this.configFile = path.join(__dirname, 'config', 'email-config.json');
    this.emailConfig = null;
    
    // Ensure directories exist
    this.initialize();
  }

  async initialize() {
    try {
      // Create output directory
      await fs.ensureDir(this.outputDir);
      await fs.ensureDir(path.dirname(this.logFile));
      
      // Load email config if exists
      if (await fs.pathExists(this.configFile)) {
        this.emailConfig = await fs.readJSON(this.configFile);
        this.log('✓ Email configuration loaded');
      } else {
        this.log('ℹ No email configuration found (optional)');
      }
      
      this.log('✓ Weekly Report Scheduler initialized');
    } catch (error) {
      this.log(`❌ Initialization error: ${error.message}`);
    }
  }

  /**
   * Log message to file and console
   */
  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    console.log(logMessage);
    
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Get ISO week number
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  /**
   * Generate weekly report filename
   */
  generateFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const week = this.getWeekNumber(now);
    const weekStr = String(week).padStart(2, '0');
    
    return `Danfosal_Report_${year}_W${weekStr}.pdf`;
  }

  /**
   * Generate weekly report
   */
  async generateReport() {
    this.log('\n========================================');
    this.log('  WEEKLY REPORT GENERATION STARTED');
    this.log('========================================\n');

    try {
      // Generate custom filename
      const filename = this.generateFilename();
      const customOutputPath = path.join(this.outputDir, filename);

      this.log(`📄 Generating report: ${filename}`);
      
      // Create PDF export service
      const service = new PDFExportService();
      
      // Override output path
      service.outputDir = this.outputDir;
      
      // Generate PDF with custom filename
      const result = await service.generatePDF({ filename });

      this.log(`✅ Report generated successfully!`);
      this.log(`📂 Location: ${result.outputPath}`);
      this.log(`📊 Size: ${(await fs.stat(result.outputPath)).size} bytes`);

      // Send email notification if configured
      if (this.emailConfig) {
        await this.sendEmailNotification(result);
      }

      this.log('\n========================================');
      this.log('  WEEKLY REPORT GENERATION COMPLETE');
      this.log('========================================\n');

      return result;

    } catch (error) {
      this.log(`❌ Report generation failed: ${error.message}`);
      this.log(error.stack);
      throw error;
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(reportResult) {
    try {
      this.log('📧 Sending email notification...');

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: this.emailConfig.smtp.host,
        port: this.emailConfig.smtp.port,
        secure: this.emailConfig.smtp.secure, // true for 465, false for 587
        auth: {
          user: this.emailConfig.smtp.user,
          pass: this.emailConfig.smtp.password
        }
      });

      // Email content
      const mailOptions = {
        from: this.emailConfig.from,
        to: this.emailConfig.recipients.join(', '),
        subject: `📊 Weekly Executive Report - ${this.generateFilename().replace('.pdf', '')}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">📊 Weekly Executive Report</h2>
            <p>Dear Team,</p>
            <p>Your automated weekly executive report has been generated successfully.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">Report Details</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>📄 Filename:</strong> ${reportResult.filename}</li>
                <li><strong>📂 Location:</strong> ${reportResult.outputPath}</li>
                <li><strong>📅 Generated:</strong> ${new Date().toLocaleString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</li>
                <li><strong>💾 Size:</strong> ${(await fs.stat(reportResult.outputPath)).size} bytes</li>
              </ul>
            </div>

            <p>The report includes:</p>
            <ul>
              <li>📈 Growth Trend Analysis (Current vs Previous Period)</li>
              <li>🚀 Product Velocity Tracking (Winners & Losers)</li>
              <li>⏰ Temporal Analysis (Day/Hour Patterns)</li>
              <li>🔮 30-Day Sales Predictions</li>
            </ul>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              <em>This is an automated message from the Danfosal Weekly Report Scheduler.</em><br>
              <em>Report location: <code>${reportResult.outputPath}</code></em>
            </p>
          </div>
        `,
        attachments: this.emailConfig.attachPDF ? [{
          filename: reportResult.filename,
          path: reportResult.outputPath
        }] : []
      };

      // Send email
      const info = await transporter.sendMail(mailOptions);
      
      this.log(`✅ Email sent successfully: ${info.messageId}`);
      this.log(`   Recipients: ${this.emailConfig.recipients.join(', ')}`);

    } catch (error) {
      this.log(`⚠️ Email notification failed: ${error.message}`);
      // Don't throw - email failure shouldn't stop the report generation
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    this.log('\n🚀 Starting Weekly Report Scheduler...');
    this.log('   Schedule: Every Monday at 08:00 AM');
    this.log('   Output: ' + this.outputDir);
    this.log('   Email: ' + (this.emailConfig ? 'Enabled' : 'Disabled'));

    // Cron expression: '0 8 * * 1' = Every Monday at 08:00 AM
    // Minute Hour Day Month DayOfWeek
    // 0      8    *   *     1 (Monday)
    const cronExpression = '0 8 * * 1';

    cron.schedule(cronExpression, async () => {
      this.log('\n⏰ Scheduled task triggered (Monday 08:00 AM)');
      try {
        await this.generateReport();
      } catch (error) {
        this.log(`❌ Scheduled task failed: ${error.message}`);
      }
    }, {
      scheduled: true,
      timezone: "Europe/Tirane" // Albania timezone
    });

    this.log('✅ Scheduler is running...');
    this.log('   Press Ctrl+C to stop\n');

    // Keep the process alive
    process.stdin.resume();
  }

  /**
   * Test report generation (manual trigger)
   */
  async test() {
    this.log('\n🧪 TEST MODE: Generating report manually...\n');
    try {
      await this.generateReport();
      this.log('\n✅ Test completed successfully!');
      process.exit(0);
    } catch (error) {
      this.log('\n❌ Test failed!');
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const scheduler = new WeeklyReportScheduler();

  // Check for test flag
  const args = process.argv.slice(2);
  if (args.includes('--test') || args.includes('-t')) {
    // Test mode: generate report immediately
    scheduler.test();
  } else {
    // Normal mode: start scheduler
    scheduler.start();
  }
}

module.exports = WeeklyReportScheduler;
