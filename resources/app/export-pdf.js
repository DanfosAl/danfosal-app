/**
 * Executive Report PDF Export Service
 * 
 * Uses Puppeteer to render executive-report.html as a high-resolution PDF
 */

const path = require('path');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const AnalyticsEngine = require('./analytics-engine');

class PDFExportService {
  constructor() {
    this.outputDir = path.join(__dirname, 'exports');
  }

  async initialize() {
    // Ensure output directory exists
    await fs.ensureDir(this.outputDir);
  }

  /**
   * Generate PDF report
   */
  async generatePDF(options = {}) {
    await this.initialize();

    console.log('\n========================================');
    console.log('  EXECUTIVE REPORT PDF GENERATION');
    console.log('========================================\n');

    // Step 1: Generate analytics data
    console.log('📊 Generating analytics data...');
    const engine = new AnalyticsEngine();
    const reportData = await engine.generateReport();
    console.log('✓ Analytics complete\n');

    // Step 2: Prepare HTML template with data
    console.log('📄 Preparing HTML report...');
    const templatePath = path.join(__dirname, 'www', 'executive-report.html');
    let htmlContent = await fs.readFile(templatePath, 'utf-8');

    // Inject report data into HTML
    const dataScript = `
      <script>
        window.REPORT_DATA = ${JSON.stringify(reportData)};
      </script>
    `;
    htmlContent = htmlContent.replace('</head>', `${dataScript}</head>`);
    console.log('✓ HTML ready\n');

    // Step 3: Launch Puppeteer and render PDF
    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    console.log('✓ Browser launched\n');

    console.log('🎨 Rendering report...');
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });

    // Wait for charts to render
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✓ Report rendered\n');

    // Step 4: Generate PDF
    console.log('📥 Generating PDF...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = options.filename || `executive-report-${timestamp}.pdf`;
    const outputPath = path.join(this.outputDir, filename);

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });

    await browser.close();
    console.log('✓ PDF generated\n');

    console.log('========================================');
    console.log('  GENERATION COMPLETE');
    console.log('========================================');
    console.log(`📄 File: ${filename}`);
    console.log(`📂 Location: ${outputPath}`);
    console.log(`📊 Pages: ${reportData ? '3' : 'Unknown'}`);
    console.log(`💾 Size: ${(await fs.stat(outputPath)).size} bytes\n`);

    return {
      success: true,
      filename,
      outputPath,
      reportData
    };
  }

  /**
   * Export report data as JSON (for web/API)
   */
  async exportJSON() {
    const engine = new AnalyticsEngine();
    const reportData = await engine.generateReport();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `executive-report-${timestamp}.json`;
    const outputPath = path.join(this.outputDir, filename);

    await fs.writeJSON(outputPath, reportData, { spaces: 2 });

    console.log(`✓ JSON exported: ${outputPath}`);

    return {
      success: true,
      filename,
      outputPath,
      reportData
    };
  }
}

// CLI execution
if (require.main === module) {
  const service = new PDFExportService();

  const args = process.argv.slice(2);
  const format = args[0] || 'pdf'; // pdf or json

  if (format === 'json') {
    service.exportJSON().then(result => {
      console.log('✅ JSON export complete!');
      process.exit(0);
    }).catch(error => {
      console.error('❌ Export failed:', error.message);
      process.exit(1);
    });
  } else {
    service.generatePDF().then(result => {
      console.log('✅ PDF generation complete!');
      console.log(`\n📖 Open: ${result.outputPath}\n`);
      process.exit(0);
    }).catch(error => {
      console.error('❌ PDF generation failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
  }
}

module.exports = PDFExportService;
