import { jsPDF } from 'jspdf';
import bwipjs from 'bwip-js';

export interface LabelRequest {
  orderNumber: string;
  shipmentCode: string;
  serviceType: string;
  warehouse: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  recipient: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  createdAt: string;
}

export async function generateLocalLabel(req: LabelRequest): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [4, 6],
  });

  const pageWidth = 4;
  const pageHeight = 6;
  const leftMargin = 0.9;
  const rightMargin = 0.2;
  const topMargin = 0.25;
  const bottomMargin = 0.25;
  let yPos = topMargin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const headerText = req.serviceType === 'LOCAL_PICKUP' ? 'LOCAL PICKUP' : 'LOCAL DELIVERY';
  doc.text(headerText, pageWidth / 2, yPos + 0.3, { align: 'center' });

  yPos += 0.55;
  doc.setLineWidth(0.02);
  doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos);

  yPos += 0.35;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Order:', leftMargin, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(req.orderNumber, leftMargin + 0.6, yPos);

  yPos += 0.24;
  doc.setFont('helvetica', 'bold');
  doc.text('Shipment:', leftMargin, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(req.shipmentCode, leftMargin + 0.85, yPos);

  yPos += 0.24;
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', leftMargin, yPos);
  doc.setFont('helvetica', 'normal');
  const date = new Date(req.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  doc.text(date, leftMargin + 0.5, yPos);

  yPos += 0.4;

  const barcodeValue = req.shipmentCode.slice(-9);

  try {
    const barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: barcodeValue,
      scale: 3,
      height: 10,
      includetext: false,
      textxalign: 'center',
    });

    const barcodeBase64 = `data:image/png;base64,${barcodeBuffer.toString('base64')}`;

    const barcodeWidth = 3.0;
    const barcodeHeight = 0.6;
    const barcodeX = (pageWidth - barcodeWidth) / 2;

    doc.addImage(barcodeBase64, 'PNG', barcodeX, yPos, barcodeWidth, barcodeHeight);

    yPos += barcodeHeight + 0.15;
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    doc.text(barcodeValue, pageWidth / 2, yPos, { align: 'center' });

    yPos += 0.3;
  } catch (error) {
    console.error('Failed to generate barcode:', error);
    throw new Error(`Barcode generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  doc.setLineWidth(0.01);
  doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos);

  yPos += 0.3;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SHIP FROM:', leftMargin, yPos);

  yPos += 0.22;
  doc.setFont('helvetica', 'normal');
  doc.text(req.warehouse.name, leftMargin, yPos);

  yPos += 0.2;
  doc.text(req.warehouse.address, leftMargin, yPos);

  yPos += 0.2;
  doc.text(`${req.warehouse.city}, ${req.warehouse.state} ${req.warehouse.zip}`, leftMargin, yPos);

  yPos += 0.2;
  doc.text('US', leftMargin, yPos);

  yPos += 0.4;
  doc.setLineWidth(0.01);
  doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos);

  yPos += 0.3;
  doc.setFont('helvetica', 'bold');
  doc.text('SHIP TO:', leftMargin, yPos);

  yPos += 0.22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(req.recipient.name, leftMargin, yPos);

  yPos += 0.22;
  doc.setFontSize(9);
  doc.text(req.recipient.address, leftMargin, yPos);

  yPos += 0.2;
  doc.text(`${req.recipient.city}, ${req.recipient.state} ${req.recipient.zip}`, leftMargin, yPos);

  yPos += 0.2;
  doc.text('US', leftMargin, yPos);

  yPos = pageHeight - bottomMargin - 0.25;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  doc.text('Internal Local Shipment', pageWidth / 2, yPos, { align: 'center' });
  yPos += 0.12;
  doc.text('No Carrier / No Tracking', pageWidth / 2, yPos, { align: 'center' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.02);
  doc.rect(leftMargin, topMargin, pageWidth - leftMargin - rightMargin, pageHeight - topMargin - bottomMargin);

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  return pdfBuffer;
}
