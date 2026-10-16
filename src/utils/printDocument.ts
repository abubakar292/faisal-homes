import toast from 'react-hot-toast';

export function printDocument(fullHtml: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement('iframe');
      // Hide the iframe securely without using display:none or 0 size
      iframe.style.position = 'fixed';
      iframe.style.left = '-10000px';
      iframe.style.top = '0';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      iframe.style.border = '0';

      document.body.appendChild(iframe);

      const doc = iframe.contentDocument;
      if (!doc) throw new Error('No contentDocument');

      doc.open();
      doc.write(fullHtml);
      doc.close();

      const finishPrint = () => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
        resolve();
      };

      const cleanup = () => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };

      const handleAfterPrint = () => {
        cleanup();
      };

      if (iframe.contentWindow) {
        iframe.contentWindow.addEventListener('afterprint', handleAfterPrint);
      }

      // Cleanup fallback after 60s
      setTimeout(cleanup, 60000);

      // Wait for images and fonts to load
      let checkCount = 0;
      const checkReady = () => {
        checkCount++;
        const images = Array.from(doc.images);
        const imagesLoaded = images.every(img => img.complete);
        const fontsLoaded = (doc as any).fonts ? (doc as any).fonts.status === 'loaded' : true;

        if ((imagesLoaded && fontsLoaded) || checkCount > 30) { // Max ~3 seconds
          finishPrint();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      // Start checking after a small delay to let browser parse
      setTimeout(checkReady, 100);

    } catch (err) {
      console.error('Iframe print failed, falling back to window.open', err);
      try {
        const win = window.open('', '_blank');
        if (!win) {
          toast.error('Printing was blocked. Allow popups for this site.');
          resolve();
          return;
        }
        win.document.open();
        win.document.write(fullHtml);
        win.document.close();
        win.focus();
        
        // Wait briefly for content to render in popup
        setTimeout(() => {
          win.print();
          resolve();
        }, 500);
      } catch (fallbackErr) {
        console.error('Fallback print also failed', fallbackErr);
        toast.error('Printing failed.');
        resolve();
      }
    }
  });
}
