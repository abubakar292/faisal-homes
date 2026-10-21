import {
  LEGAL_NAME,
  SIGNATURES_LABEL,
  APPLICANT_LABEL,
  NOMINEE_LABEL,
  OFFICER_LABEL
} from '../config/letterhead';

export interface LetterheadSection {
  title: string;
  bodyHtml: string;
}

export interface BuildLetterheadOptions {
  sections: LetterheadSection[];
  repeatFooter?: boolean;
}

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return '';
}

export const LETTERHEAD_CSS = `
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
  }
  .lh-page-origin {
    position: relative;
    width: 210mm;
  }
  .lh-notch-title {
    position: absolute;
    top: 33mm;
    left: 0;
    right: 0;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-style: italic;
    font-size: 19pt;
    line-height: 13mm;
    color: #111;
    pointer-events: none;
    z-index: 10;
  }
  .lh-notch-title.lh-title-sm {
    font-size: 15pt;
  }
  table.lh-doc {
    width: 210mm;
    min-height: 297mm;
    border-collapse: collapse;
    border-spacing: 0;
    margin: 0;
    padding: 0;
  }
  thead {
    display: table-header-group;
  }
  tfoot {
    display: table-footer-group;
  }
  thead td, tfoot td, tbody td {
    padding: 0;
    margin: 0;
  }
  tbody td {
    vertical-align: top;
  }
  .lh-header-wrap {
    width: 210mm;
    height: 52.4mm;
    overflow: hidden;
    line-height: 0;
    margin: 0;
    padding: 0;
  }
  .lh-header-img {
    width: 210mm;
    height: 52.4mm;
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .lh-content {
    padding: 5.6mm 14mm 4mm 14mm;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1a1a1a;
  }
  .lh-section-break {
    page-break-before: always;
    break-before: page;
  }
  .lh-section-title {
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-style: italic;
    font-size: 16pt;
    color: #1a1a1a;
    margin: 8mm 0 4mm 0;
  }
  .lh-footer-spacer {
    width: 210mm;
    height: 60mm;
  }
  .lh-footer-fixed {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 210mm;
    height: 60mm;
    background: #fff;
    overflow: hidden;
    z-index: 999;
  }
  .lh-sig-title {
    position: absolute;
    left: 13mm;
    top: 4.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
  }
  .lh-applicant-row {
    position: absolute;
    left: 13mm;
    top: 19.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
    white-space: nowrap;
  }
  .lh-nominee-row {
    position: absolute;
    left: 14mm;
    top: 31.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
    white-space: nowrap;
  }
  .lh-officer-row {
    position: absolute;
    left: 13mm;
    top: 46.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
    white-space: nowrap;
  }
  .lh-blank-line {
    display: inline-block;
    width: 38mm;
    border-bottom: 1.5px solid #000;
    margin-left: 6px;
    vertical-align: baseline;
    height: 0;
  }
  .lh-logo-wrap {
    position: absolute;
    left: 160mm;
    top: 0mm;
    width: 38mm;
    height: 38mm;
  }
  .lh-footer-logo {
    width: 38mm;
    height: auto;
    display: block;
  }
  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .lh-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-bottom: 8px;
  }
  .lh-table th, .lh-table td {
    border: 1px solid #cbd5e1;
    padding: 4px 6px;
  }
  .lh-table th {
    background: #f1f5f9;
    font-weight: bold;
    text-align: left;
  }
  .lh-info-title {
    background: #f0f4f8;
    border-bottom: 2px solid #1a3c6e;
    padding: 3px 8px;
    font-weight: bold;
    font-size: 9.5pt;
    color: #1a3c6e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .lh-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 8.5pt;
    font-weight: bold;
  }
  .lh-copy-tag {
    display: inline-block;
    padding: 2px 8px;
    background: #1a3c6e;
    color: #fff;
    font-size: 9pt;
    font-weight: bold;
    border-radius: 2px;
    margin-bottom: 6px;
  }
  .lh-copy-tag.customer {
    background: #0d9488;
  }
`;

export function buildLetterheadDocument(options: BuildLetterheadOptions): string {
  const { sections, repeatFooter = true } = options;
  const section0 = sections[0] || { title: '', bodyHtml: '' };
  const isLong = section0.title.length > 25;

  const origin = getOrigin();
  const headerImgUrl = origin
    ? new URL('/brand/letterhead/letterhead-header.png', origin).href
    : '/brand/letterhead/letterhead-header.png';
  const logoImgUrl = origin
    ? new URL('/brand/letterhead/sk-logo-gray.png', origin).href
    : '/brand/letterhead/sk-logo-gray.png';

  let bodyContent = `
    <div class="lh-section lh-section-first">
      <div class="lh-content">
        ${section0.bodyHtml}
      </div>
    </div>
  `;

  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    bodyContent += `
      <div class="lh-section-break"></div>
      <div class="lh-section">
        <div class="lh-section-title">${sec.title}</div>
        <div class="lh-content">
          ${sec.bodyHtml}
        </div>
      </div>
    `;
  }

  const footerFixedMarkup = repeatFooter
    ? `
      <div class="lh-footer-fixed">
        <div class="lh-sig-title">${SIGNATURES_LABEL}</div>
        <div class="lh-applicant-row">${APPLICANT_LABEL} <span class="lh-blank-line"></span></div>
        <div class="lh-nominee-row">${NOMINEE_LABEL} <span class="lh-blank-line"></span></div>
        <div class="lh-officer-row">${OFFICER_LABEL} <span class="lh-blank-line"></span></div>
        <div class="lh-logo-wrap">
          <img class="lh-footer-logo" src="${logoImgUrl}" alt="SK Logo" />
        </div>
      </div>
    `
    : '';

  const footerSpacerMarkup = repeatFooter
    ? `
      <tfoot>
        <tr>
          <td>
            <div class="lh-footer-spacer"></div>
          </td>
        </tr>
      </tfoot>
    `
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${section0.title || 'Document'}</title>
  <style>
${LETTERHEAD_CSS}
  </style>
</head>
<body>
  <div class="lh-page-origin">
    <div class="lh-notch-title ${isLong ? 'lh-title-sm' : ''}">${section0.title}</div>
    ${footerFixedMarkup}
    <table class="lh-doc">
      <thead>
        <tr>
          <td>
            <div class="lh-header-wrap">
              <img class="lh-header-img" src="${headerImgUrl}" alt="Letterhead Header" />
            </div>
          </td>
        </tr>
      </thead>
      ${footerSpacerMarkup}
      <tbody>
        <tr>
          <td>
            ${bodyContent}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
