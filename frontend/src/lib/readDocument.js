export async function readDocument(file) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
  let pages;
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 100) throw new Error('Choose a PDF with 100 pages or fewer.');
      pages = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        pages.push({ page: index, text: content.items.map(item => item.str || '').join(' ') });
        page.cleanup();
      }
    } finally { await task.destroy(); }
  } else if (/\.(txt|md)$/i.test(file.name)) {
    pages = [{ page: 1, text: await file.text() }];
  } else throw new Error('Supported files: PDF, TXT and Markdown.');
  const length = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (!length || !pages.some(page => page.text.trim())) throw new Error('No readable text found. Scanned PDFs need OCR before upload.');
  if (length > 300000) throw new Error('This document is too large. Use up to 300,000 text characters.');
  return { name: file.name, pages, content: pages.map(page => page.text).join('\n') };
}
