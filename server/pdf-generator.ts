import PDFDocument from 'pdfkit';
import { type Invoice, type Client, type InvoiceLineItem, type InvoiceSettings } from '@shared/schema';
import { format } from 'date-fns';

export async function generateInvoicePDF(
  invoice: Invoice,
  client: Client | null,
  items: InvoiceLineItem[],
  settings: InvoiceSettings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const safe = (val: string | null | undefined): string => val || '';
    
    const formatTotal = (val: string | number | null | undefined): string => {
      const num = Number(val);
      if (isNaN(num)) return '$0.00';
      return '$' + num.toFixed(2);
    };

    const formatPrice = (val: string | number | null | undefined): string => {
      const num = Number(val);
      if (isNaN(num)) return '$0';
      if (Number.isInteger(num)) return '$' + num.toString();
      return '$' + num.toString();
    };

    const formatHours = (val: string | number | null | undefined): string => {
      const num = Number(val);
      if (isNaN(num)) return '0 hrs';
      return num.toString() + ' hrs';
    };

    // Business and bank details come from invoice_settings only. They used to
    // have hardcoded fallbacks, which meant real account numbers lived in the
    // source of a public repository.
    const businessName = safe(settings?.businessName);
    const abn = safe(settings?.abn);
    const accountName = safe(settings?.accountName);
    const bsb = safe(settings?.bsb);
    const accountNumber = safe(settings?.accountNumber);

    const invoiceNumber = safe(invoice.invoiceNumber);
    const issueDate = invoice.issueDate 
      ? format(new Date(invoice.issueDate), 'dd/MM/yyyy') 
      : format(new Date(), 'dd/MM/yyyy');
    
    const clientName = safe(client?.name) || 'Client';
    const clientAddress = safe(client?.address);
    const clientPhone = safe(client?.phone);
    const issuedTo = clientAddress ? `${clientName} – ${clientAddress}` : clientName;

    // Title
    doc.font('Times-Italic').fontSize(24).text('Invoice', { align: 'center', underline: true });
    doc.moveDown(1.5);

    // Info section
    doc.font('Times-Bold').fontSize(11);
    
    const writeField = (label: string, value: string) => {
      doc.font('Times-Bold').text(label, { continued: true, underline: true });
      doc.font('Times-Roman').text(' ' + value, { underline: false });
    };

    writeField('Name:', businessName);
    writeField('ABN:', abn);
    writeField('Invoice number:', invoiceNumber);
    writeField('Date issued:', issueDate);
    writeField('Issued to:', issuedTo);
    writeField('Phone number:', clientPhone);
    
    doc.moveDown(1);

    // Table
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [130, 100, 100, 100];
    const rowHeight = 25;

    // Table header
    doc.rect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#000');
    doc.fillColor('#fff').font('Times-Bold').fontSize(10);
    
    let x = tableLeft + 5;
    ['Service date', 'Hours', 'Price', 'Total'].forEach((header, i) => {
      doc.text(header, x, tableTop + 7, { width: colWidths[i] - 10, underline: true });
      x += colWidths[i];
    });

    // Table rows
    doc.fillColor('#000').font('Times-Roman');
    let y = tableTop + rowHeight;

    const safeItems = items || [];
    
    if (safeItems.length === 0) {
      doc.rect(tableLeft, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).stroke();
      doc.text('No items', tableLeft + 5, y + 7);
      y += rowHeight;
    } else {
      safeItems.forEach((item) => {
        const desc = safe(item.description);
        const datePart = desc.split(':')[0].split(' ')[0] || 'Service';
        let serviceDate = datePart;
        try {
          if (datePart.match(/^\d{4}-\d{2}-\d{2}/)) {
            serviceDate = format(new Date(datePart), 'dd/MM/yy');
          }
        } catch {}

        doc.rect(tableLeft, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).stroke();
        
        x = tableLeft + 5;
        const values = [
          serviceDate,
          formatHours(item.quantity),
          formatPrice(item.unitPrice),
          formatTotal(item.amount)
        ];
        
        values.forEach((val, i) => {
          doc.text(val, x, y + 7, { width: colWidths[i] - 10 });
          x += colWidths[i];
        });
        
        y += rowHeight;
      });
    }

    doc.moveDown(1);
    
    // Total
    doc.font('Times-Bold').fontSize(11);
    doc.text(`Total: ${formatTotal(invoice.total)}`, { align: 'right', underline: true });
    
    doc.moveDown(3);

    // Payment section
    doc.font('Times-Bold').text('Payment method:', { underline: true });
    doc.moveDown(0.3);
    
    writeField('Account name:', accountName);
    writeField('BSB:', bsb);
    writeField('Account number:', accountNumber);

    doc.end();
  });
}
