import { PDFDocument } from 'pdf-lib';

export async function toPdf(buffer) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return buffer;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error('Uploaded document is not a PDF or JPEG');
  }

  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(Uint8Array.from(buffer));
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return Buffer.from(await pdf.save());
}
