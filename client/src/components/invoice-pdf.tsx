import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { type Invoice, type Client, type InvoiceLineItem, type InvoiceSettings, type FieldMapping, type InvoiceTemplate } from '@shared/schema';

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 11,
    fontFamily: 'Times-Roman',
    color: '#000',
  },
  header: {
    fontSize: 24,
    fontFamily: 'Times-Italic',
    textAlign: 'center',
    marginBottom: 25,
    textDecoration: 'underline',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    textDecoration: 'underline',
    fontFamily: 'Times-Bold',
  },
  infoValue: {
    fontFamily: 'Times-Roman',
    marginLeft: 4,
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#000',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  tableHeaderCell: {
    color: '#fff',
    fontFamily: 'Times-Bold',
    fontSize: 10,
    padding: 6,
    textDecoration: 'underline',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  tableCell: {
    fontSize: 10,
    padding: 6,
    fontFamily: 'Times-Roman',
  },
  colDate: { 
    width: '25%',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  colHours: { 
    width: '25%',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  colPrice: { 
    width: '25%',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  colTotal: { 
    width: '25%',
  },
  totalSection: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: 'Times-Bold',
    textDecoration: 'underline',
  },
  paymentSection: {
    marginTop: 40,
  },
  paymentHeader: {
    fontFamily: 'Times-Bold',
    marginBottom: 8,
    fontSize: 11,
    textDecoration: 'underline',
  },
  bankRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  bankLabel: {
    textDecoration: 'underline',
    fontFamily: 'Times-Roman',
  },
  bankValue: {
    fontFamily: 'Times-Roman',
    marginLeft: 4,
  },
});

interface InvoicePDFProps {
  invoice: Invoice;
  client: Client | null;
  items: InvoiceLineItem[];
  settings: InvoiceSettings;
  template?: InvoiceTemplate | null;
}

export function InvoicePDF({ invoice, client, items, settings, template }: InvoicePDFProps) {
  if (template?.type === "custom" && template.uploadedFileUrl && template.fieldMappings) {
    return (
      <CustomTemplatePDF
        invoice={invoice}
        client={client}
        items={items}
        settings={settings}
        template={template}
      />
    );
  }

  const formatTotal = (val: string | number | null | undefined): string => {
    const num = Number(val);
    if (isNaN(num)) return '$0.00';
    return '$' + num.toFixed(2);
  };

  const formatPrice = (val: string | number | null | undefined): string => {
    const num = Number(val);
    if (isNaN(num)) return '$0';
    if (Number.isInteger(num)) {
      return '$' + num.toString();
    }
    return '$' + num.toString();
  };

  const formatHours = (val: string | number | null | undefined): string => {
    const num = Number(val);
    if (isNaN(num)) return '0 hrs';
    return (Number.isInteger(num) ? num.toString() : num.toString()) + ' hrs';
  };

  const safe = (val: string | null | undefined): string => val || '';

  // Business and bank details come from invoice_settings only. They used to
  // have hardcoded fallbacks, which meant real account numbers lived in the
  // source of a public repository.
  const businessName = safe(settings?.businessName);
  const abn = safe(settings?.abn);
  const accountName = safe(settings?.accountName);
  const bsb = safe(settings?.bsb);
  const accountNumber = safe(settings?.accountNumber);

  if (!invoice) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text>Error: Invoice data not available</Text>
        </Page>
      </Document>
    );
  }

  const safeItems = items || [];
  const invoiceNumber = safe(invoice.invoiceNumber);
  const issueDate = invoice.issueDate 
    ? format(new Date(invoice.issueDate), 'dd/MM/yyyy') 
    : format(new Date(), 'dd/MM/yyyy');
  
  const clientName = safe(client?.name) || 'Client';
  const clientAddress = safe(client?.address);
  const clientPhone = safe(client?.phone);
  const issuedTo = clientAddress ? `${clientName} – ${clientAddress}` : clientName;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>Invoice</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{businessName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>ABN:</Text>
          <Text style={styles.infoValue}>{abn}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Invoice number:</Text>
          <Text style={styles.infoValue}>{invoiceNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Date issued:</Text>
          <Text style={styles.infoValue}>{issueDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Issued to:</Text>
          <Text style={styles.infoValue}>{issuedTo}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone number:</Text>
          <Text style={styles.infoValue}>{clientPhone}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={[styles.colDate]}>
              <Text style={styles.tableHeaderCell}>Service date</Text>
            </View>
            <View style={[styles.colHours]}>
              <Text style={styles.tableHeaderCell}>Hours</Text>
            </View>
            <View style={[styles.colPrice]}>
              <Text style={styles.tableHeaderCell}>Price</Text>
            </View>
            <View style={[styles.colTotal]}>
              <Text style={styles.tableHeaderCell}>Total</Text>
            </View>
          </View>
          {safeItems.length === 0 ? (
            <View style={styles.tableRow}>
              <View style={[styles.colDate]}>
                <Text style={styles.tableCell}>No items</Text>
              </View>
              <View style={[styles.colHours]}>
                <Text style={styles.tableCell}>0 hrs</Text>
              </View>
              <View style={[styles.colPrice]}>
                <Text style={styles.tableCell}>$0</Text>
              </View>
              <View style={[styles.colTotal]}>
                <Text style={styles.tableCell}>$0.00</Text>
              </View>
            </View>
          ) : (
            safeItems.map((item, i) => {
              const desc = safe(item.description);
              const datePart = desc.split(':')[0].split(' ')[0] || 'Service';
              let serviceDate = datePart;
              try {
                if (datePart.match(/^\d{4}-\d{2}-\d{2}/)) {
                  serviceDate = format(new Date(datePart), 'dd/MM/yy');
                }
              } catch {}
              
              return (
                <View key={i} style={styles.tableRow}>
                  <View style={[styles.colDate]}>
                    <Text style={styles.tableCell}>{serviceDate}</Text>
                  </View>
                  <View style={[styles.colHours]}>
                    <Text style={styles.tableCell}>{formatHours(item.quantity)}</Text>
                  </View>
                  <View style={[styles.colPrice]}>
                    <Text style={styles.tableCell}>{formatPrice(item.unitPrice)}</Text>
                  </View>
                  <View style={[styles.colTotal]}>
                    <Text style={styles.tableCell}>{formatTotal(item.amount)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total: {formatTotal(invoice.total)}</Text>
        </View>

        <View style={styles.paymentSection}>
          <Text style={styles.paymentHeader}>Payment method:</Text>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Account name:</Text>
            <Text style={styles.bankValue}>{accountName}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>BSB:</Text>
            <Text style={styles.bankValue}>{bsb}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Account number:</Text>
            <Text style={styles.bankValue}>{accountNumber}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function CustomTemplatePDF({ invoice, client, items, settings, template }: {
  invoice: Invoice;
  client: Client | null;
  items: InvoiceLineItem[];
  settings: InvoiceSettings;
  template: InvoiceTemplate;
}) {
  const mappingsData = template.fieldMappings as any;
  let fieldMappings: FieldMapping[] = [];
  let sourceWidth = 595.28;
  let sourceHeight = 841.89;
  
  if (Array.isArray(mappingsData)) {
    fieldMappings = mappingsData;
  } else if (mappingsData && typeof mappingsData === 'object' && 'fields' in mappingsData) {
    fieldMappings = mappingsData.fields || [];
    if (mappingsData.pageWidth) sourceWidth = mappingsData.pageWidth;
    if (mappingsData.pageHeight) sourceHeight = mappingsData.pageHeight;
  }
  const safe = (val: string | null | undefined): string => val || '';
  const fmtMoney = (val: string | number | null | undefined): string => {
    const num = Number(val);
    if (isNaN(num)) return '$0.00';
    return '$' + num.toFixed(2);
  };

  const issueDate = invoice.issueDate ? format(new Date(invoice.issueDate), 'dd/MM/yyyy') : '';
  const dueDateStr = invoice.dueDate ? format(new Date(invoice.dueDate), 'dd/MM/yyyy') : '';

  const getFieldValue = (field: FieldMapping): string => {
    switch (field.fieldType) {
      case 'invoice_number': return safe(invoice.invoiceNumber);
      case 'invoice_date': return issueDate;
      case 'due_date': return dueDateStr;
      case 'client_name': return safe(client?.name);
      case 'client_email': return safe(client?.email) || safe(client?.billingEmail);
      case 'client_address': return safe(client?.address);
      case 'business_name': return safe(settings?.businessName);
      case 'business_email': return safe(settings?.businessEmail);
      case 'abn': return safe(settings?.abn);
      case 'subtotal': return fmtMoney(invoice.subtotal);
      case 'tax': return fmtMoney(invoice.taxAmount);
      case 'discount': {
        const disc = Number(invoice.discountAmount) || 0;
        return disc > 0 ? `-${fmtMoney(disc)}` : '';
      }
      case 'total': return fmtMoney(invoice.total);
      case 'notes': return safe(invoice.notes);
      case 'payment_details': {
        const parts = [];
        if (settings?.accountName) parts.push(`Account: ${settings.accountName}`);
        if (settings?.bsb) parts.push(`BSB: ${settings.bsb}`);
        if (settings?.accountNumber) parts.push(`Acc: ${settings.accountNumber}`);
        return parts.join(' | ');
      }
      case 'custom': return field.label;
      default: return '';
    }
  };

  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const scaleX = A4_WIDTH / sourceWidth;
  const scaleY = A4_HEIGHT / sourceHeight;

  const s = (val: number, axis: 'x' | 'y') => val * (axis === 'x' ? scaleX : scaleY);

  return (
    <Document>
      <Page size="A4" style={{ position: 'relative', width: A4_WIDTH, height: A4_HEIGHT }}>
        {template.uploadedFileUrl && (
          <Image
            src={template.uploadedFileUrl}
            style={{ position: 'absolute', top: 0, left: 0, width: A4_WIDTH, height: A4_HEIGHT }}
          />
        )}
        {fieldMappings.filter(f => f.fieldType !== 'line_items_table').map(field => (
          <Text
            key={field.id}
            style={{
              position: 'absolute',
              left: s(field.x, 'x'),
              top: s(field.y, 'y'),
              width: s(field.width, 'x'),
              height: s(field.height, 'y'),
              fontSize: s(field.fontSize, 'x'),
              fontWeight: field.fontWeight === 'bold' ? 700 : 400,
              fontFamily: field.fontWeight === 'bold' ? 'Times-Bold' : 'Times-Roman',
              textAlign: field.textAlign as 'left' | 'center' | 'right',
            }}
          >
            {getFieldValue(field)}
          </Text>
        ))}
        {fieldMappings.filter(f => f.fieldType === 'line_items_table').map(tableField => {
          const scaledFontSize = s(tableField.fontSize, 'x');
          const lineHeight = scaledFontSize + 6;
          return (
            <View
              key={tableField.id}
              style={{
                position: 'absolute',
                left: s(tableField.x, 'x'),
                top: s(tableField.y, 'y'),
                width: s(tableField.width, 'x'),
              }}
            >
              {items.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', marginBottom: 2, height: lineHeight }}>
                  <Text style={{ width: '50%', fontSize: scaledFontSize, fontFamily: 'Times-Roman' }}>
                    {safe(item.description)}
                  </Text>
                  <Text style={{ width: '15%', fontSize: scaledFontSize, fontFamily: 'Times-Roman', textAlign: 'right' }}>
                    {item.quantity}
                  </Text>
                  <Text style={{ width: '15%', fontSize: scaledFontSize, fontFamily: 'Times-Roman', textAlign: 'right' }}>
                    {fmtMoney(item.unitPrice)}
                  </Text>
                  <Text style={{ width: '20%', fontSize: scaledFontSize, fontFamily: 'Times-Roman', textAlign: 'right' }}>
                    {fmtMoney(item.amount)}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
