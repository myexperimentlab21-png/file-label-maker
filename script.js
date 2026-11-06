/* =====================================================================
   FILE LABEL MAKER  -  script.js  (how everything BEHAVES)

   Contents:
     1. Settings
     2. Data: companies and document presets
     3. State: the values the app remembers
     4. Small helper functions
     5. Building ONE label (HTML text)
     6. Drawing on the screen: preview and sheet
     7. Saving and loading (browser storage)
     8. The form: typing, presets, logo upload
     9. The buttons: add, clear, remove
    10. Download PDF
    11. Start-up
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. SETTINGS
   --------------------------------------------------------------------- */

// How many labels fit on one A4 landscape sheet
const MAX_LABELS = 5;

// Usable text width inside the label, in pixels (label is 4.5cm wide).
// Used to shrink long text so it always fits.
const TEXT_WIDTH = 138;

// Name used when saving your work in the browser (see section 7)
const STORAGE_KEY = 'fileLabelMaker3';


/* ---------------------------------------------------------------------
   2. DATA
   --------------------------------------------------------------------- */

// The company shown in the label header. Change the texts or the colour here.
const COMPANY = {
  // name: 'Al Shula General Trading Co. L.L.C.',
  // arabic: 'شركة الشعلة للتجارة العامة ش.ذ.م.م',
  // color: '#d71920'                       // colour of the flame icon
};

// Document presets (colour scheme "Option A": one colour per document type).
// Format:  'Name in the dropdown': [text on the banner, banner colour, text colour]
// The banner shows a SHORT text: names of 14 letters or fewer are written in
// full (Purchase Order, Debit Note), longer ones as a hyphenated code
// such as FT-CML-CN or AP-TAX-DN. You can edit any of them here.
const PRESETS = {
  // Receivable (sales and money in)
  'Tax Invoice':                        ['Tax Invoice',          '#ffff00', '#000000'],  // yellow
  'Invoice':                            ['Invoice',              '#ffe699', '#000000'],
  'Commercial Invoice':                 ['CML-INV',   '#ffd966', '#000000'],
  'Cash Receipt Voucher':               ['CASH-RV', '#92d050', '#000000'],
  'Bank Receipt Voucher':               ['BANK-RV', '#6fcf97', '#000000'],
  'Sales Return Tax Credit Note':       ['SR-TAX-CN',  '#cda9f5', '#000000'],
  'FT Tax Credit Note':                 ['FT-TAX-CN',   '#b085f5', '#000000'],
  'FT Commercial Credit Note':          ['FT-CML-CN',     '#e4d0fa', '#000000'],
  // Payable (purchase and money out)
  'Bank Payment Voucher':               ['BANK-PV', '#ff7c80', '#000000'],
  'Post-Dated Cheque Voucher (AP PDC)': ['AP-PDC',       '#ffb3b3', '#000000'],
  'Vendor Invoice':                     ['Vendor Invoice',       '#f4b183', '#000000'],
  'Debit Note':                         ['Debit Note',           '#c5dff4', '#000000'],
  'AP Tax Debit Note':                  ['AP-TAX-DN',    '#8fbfe8', '#000000'],
  'FT Commercial Debit Note':           ['FT-CML-DN',     '#5b9bd5', '#000000'],
  'Purchase Order':                     ['Purchase Order',       '#4fd1c5', '#000000'],
  'Goods Received Note':                ['GRN',  '#a8e6df', '#000000'],
  // Neutral
  'General Journal Voucher':            ['GJV', '#bfbfbf', '#000000']
};

// The colour of the bar at the bottom of the label depends on the
// document code. To add a code, add one line here.
const CODE_COLORS = {
  '5040': '#ff0000',   // red
  '5046': '#00b050',   // green
  '5047': '#7030a0'    // purple
};
const DEFAULT_BAR_COLOR = '#8b0000';   // dark red, used for any other code


/* ---------------------------------------------------------------------
   3. STATE  (the values the app keeps in memory)
   --------------------------------------------------------------------- */

// What is currently typed in the form. Each key matches a
// data-field="..." in index.html.
let form = {
  year: '2026',
  volume: '01',
  code: '5040',
  preset: 'Tax Invoice',
  title: 'Tax Invoice',
  bgColor: '#ffff00',
  textColor: '#000000',
  from: '',
  to: '',
  logo: ''     // your uploaded logo picture (empty = default icon + name).
               // It is copied together with the label, so a label on the
               // sheet keeps its own logo even if you upload another one later.
};

// Labels already added to the sheet (a list of copies of "form")
let queue = [];

// Is the "add tracking sheets" box ticked?
let addTracking = true;

// Is the "show the range on the tracking sheets" box ticked?
let showRangeOnTracking = false;


/* ---------------------------------------------------------------------
   4. SMALL HELPER FUNCTIONS
   --------------------------------------------------------------------- */

// Short way to find an element by its id
function getEl(id) {
  return document.getElementById(id);
}

// Makes typed text safe to put inside HTML (stops "<" from breaking the page)
function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"]/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
  });
}

// "01" -> "VOL.01"   (also fixes "vol.01" typed by mistake)
function volumeText(data) {
  return 'VOL.' + String(data.volume).replace(/^vol\.?/i, '');
}

// Picks a font size so long text still fits the narrow label.
// The longest WORD decides the size, because spaces can wrap to a new line.
function fitFontSize(text, maxSize, availableWidth) {
  const words = String(text).split(/\s+/);
  let longest = 1;
  for (const word of words) {
    longest = Math.max(longest, word.length);
  }
  const size = availableWidth / (longest * 0.7);   // 0.7 = average letter width
  return Math.max(11, Math.min(maxSize, size)).toFixed(1);   // between 11px and max
}

// The banner text can wrap onto several lines, so we try font sizes from
// big to small until the wrapped text fits the banner (about TEXT_WIDTH x 84 px).
function fitBannerFontSize(text, maxSize) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  for (let size = maxSize; size > 11; size--) {
    const charWidth = size * 0.72;      // average width of one capital letter
    let lines = 1;
    let lineWidth = 0;
    let tooWide = false;
    for (const word of words) {
      const wordWidth = word.length * charWidth;
      if (wordWidth > TEXT_WIDTH) tooWide = true;                       // one word is wider than the label
      if (lineWidth === 0) {
        lineWidth = wordWidth;                                   // first word on the line
      } else if (lineWidth + charWidth + wordWidth <= TEXT_WIDTH) {
        lineWidth += charWidth + wordWidth;                      // fits on the same line
      } else {
        lines++;                                                 // start a new line
        lineWidth = wordWidth;
      }
    }
    if (!tooWide && lines * size * 1.1 <= 84) return size;
  }
  return 11;
}

// Bottom bar colour for a document code (5040, 5046, 5047 have their own colour)
function barColorFor(code) {
  for (const key in CODE_COLORS) {
    if (String(code).includes(key)) return CODE_COLORS[key];
  }
  return DEFAULT_BAR_COLOR;
}


/* ---------------------------------------------------------------------
   5. BUILDING ONE LABEL
   Takes a data object and returns the label as HTML text.
   Both the preview and the sheet use this same function.
   --------------------------------------------------------------------- */
function buildLabel(data) {

  // Header: an uploaded logo if there is one, otherwise icon + names
  let headerHtml;
  if (data.logo) {
    headerHtml = '<img class="lbl-logo-img" src="' + data.logo + '" alt="">';
  } else {
    headerHtml =
      '<svg class="lbl-emblem" viewBox="0 0 40 40">' +
        '<path d="M21 2c2 7 12 11 12 22a12 12 0 0 1-24 0c0-6 3-9 6-13 0 3 1 5 3 6 0-6-1-10 3-15z" fill="' + escapeHtml(COMPANY.color) + '"/>' +
        '<path d="M21 24c2 3 5 5 5 9a5 5 0 0 1-10 0c0-4 3-6 5-9z" fill="#fff"/>' +
      '</svg>' +
      '<div class="lbl-names">' +
        '<span class="lbl-arabic" dir="rtl">' + escapeHtml(COMPANY.arabic) + '</span>' +
        '<span class="lbl-english">' + escapeHtml(COMPANY.name) + '</span>' +
      '</div>';
  }

  // Text for the rows
  const volume = volumeText(data);

  // Font sizes (TEXT_WIDTH = usable width in pixels inside the label)
  const yearSize   = 'font-size:' + fitFontSize(data.year,  40, TEXT_WIDTH) + 'px';
  const volumeSize = 'font-size:' + fitFontSize(volume,     30, TEXT_WIDTH) + 'px';
  const codeSize   = 'font-size:' + fitFontSize(data.code,  26, TEXT_WIDTH) + 'px';
  const titleSize  = 'font-size:' + fitBannerFontSize(data.title, 32) + 'px';

  // A code without spaces (FT-CML-CN) must never break onto two lines
  const noWrap = /\s/.test(data.title) ? '' : ';white-space:nowrap';

  // The banner colours come from the data
  const bannerStyle =
    'background:' + escapeHtml(data.bgColor) + ';' +
    'color:' + escapeHtml(data.textColor) + ';' + titleSize + noWrap;

  // Put all the rows together, top to bottom
  return (
    '<div class="lbl">' +
      '<div class="lbl-row lbl-header"><div class="lbl-logobox">' + headerHtml + '</div></div>' +
      '<div class="lbl-row lbl-year" style="' + yearSize + '">' + escapeHtml(data.year) + '</div>' +
      '<div class="lbl-row lbl-volume" style="' + volumeSize + '">' + escapeHtml(volume) + '</div>' +
      '<div class="lbl-row lbl-code" style="' + codeSize + '">' + escapeHtml(data.code) + '</div>' +
      '<div class="lbl-row lbl-banner" style="' + bannerStyle + '">' + escapeHtml(data.title) + '</div>' +
      '<div class="lbl-row lbl-range lbl-from"><span>from</span><b>' + escapeHtml(data.from) + '</b></div>' +
      '<div class="lbl-row lbl-range lbl-to"><span>to</span><b>' + escapeHtml(data.to) + '</b></div>' +
      '<div class="lbl-bar" style="background:' + barColorFor(data.code) + '"></div>' +
    '</div>'
  );
}

// All queued labels, each wrapped in a dashed cutting-guide box
function buildAllCells() {
  let html = '';
  for (const data of queue) {
    html += '<div class="cell">' + buildLabel(data) + '</div>';
  }
  return html;
}


/* ---------------------------------------------------------------------
   5b. BUILDING ONE TRACKING SHEET (the "index" page, A4 portrait)
   It shows the same label on the left and an empty table on the right
   where people sign when they take out / return a document.
   --------------------------------------------------------------------- */

// How many empty writing rows the table has
const TRACKING_ROWS = 20;

function buildTrackingPage(data) {
  // Unless "Show the range" is ticked, leave the from / to numbers empty
  // (only the range is hidden, the rest of the label stays the same)
  const labelData = showRangeOnTracking ? data : Object.assign({}, data, { from: '', to: '' });

  // Empty rows, each with a small tick box in the last column
  let rowsHtml = '';
  for (let i = 0; i < TRACKING_ROWS; i++) {
    rowsHtml += '<div class="track-row"><span></span><span></span><span></span>' +
                '<span><i class="track-box"></i></span></div>';
  }

  return (
    '<div class="track-page">' +
      '<div class="track-main">' +
        buildLabel(labelData) +                              // the label (left)
        '<div class="track-table">' +                        // the table (right)
          '<div class="track-title">File Status Tracker Activity History</div>' +
          '<div class="track-head"><span>Sl.no</span><span>Document Number</span>' +
            '<span>Date,Name&amp;Signature</span><span>Returned,Date</span></div>' +
          rowsHtml +
        '</div>' +
      '</div>' +
      '<div class="track-note">&quot;Please sign and date this document for our records&quot;</div>' +
    '</div>'
  );
}


/* ---------------------------------------------------------------------
   6. DRAWING ON THE SCREEN
   --------------------------------------------------------------------- */

// Redraw the single preview label
function drawPreview() {
  getEl('preview').innerHTML = buildLabel(form);

  // Small preview of the tracking sheet (only when the box is ticked)
  getEl('trackThumbWrap').hidden = !addTracking;
  getEl('rangeCheck').disabled = !addTracking;   // only useful when tracking sheets are on
  if (addTracking) {
    getEl('trackPreview').innerHTML = buildTrackingPage(form);
  }
  saveData();
}

// Redraw the sheet, the counter, the remove buttons and the messages
function drawSheet() {

  // The paper: the labels, or a hint if there are none yet
  if (queue.length > 0) {
    getEl('sheet').innerHTML = buildAllCells();
  } else {
    getEl('sheet').innerHTML =
      '<p class="empty-msg">No labels yet. Fill in the details and choose “Add label to sheet”.</p>';
  }

  // Counter: "(3 of 5 labels)"
  getEl('count').textContent = '(' + queue.length + ' of ' + MAX_LABELS + ' labels)';

  // Enable/disable buttons
  getEl('addBtn').disabled = queue.length >= MAX_LABELS;   // full sheet
  getEl('clearBtn').disabled = queue.length === 0;         // nothing to clear
  getEl('pdfBtn').disabled = queue.length === 0;           // nothing to print

  // One remove button per label. data-index remembers its position.
  let chipsHtml = '';
  queue.forEach(function (data, index) {
    const name = escapeHtml(volumeText(data) + ' ' + data.code);
    chipsHtml += '<button class="chip" type="button" data-index="' + index +
                 '" aria-label="Remove label ' + name + '">' + name + ' ✕</button>';
  });
  getEl('chips').innerHTML = chipsHtml;

  // Message when full
  getEl('status').textContent =
    queue.length >= MAX_LABELS ? 'The sheet is full. Remove a label to add another.' : '';

  // Tell the user how many pages the PDF will have
  const info = getEl('pageInfo');
  if (queue.length === 0) {
    info.textContent = '';
  } else if (addTracking) {
    info.textContent = 'PDF: 1 label sheet + ' + queue.length + ' tracking sheet' +
                       (queue.length > 1 ? 's' : '') + ' = ' + (queue.length + 1) + ' pages.';
  } else {
    info.textContent = 'PDF: 1 label sheet (no tracking sheets).';
  }

  shrinkSheetToFit();
  saveData();
}

// The paper is 297mm wide, which is wider than most screens.
// Shrink it on screen only (the PDF always uses the full size).
function shrinkSheetToFit() {
  const sheet = getEl('sheet');
  const wrap = getEl('sheetWrap');
  const scale = Math.min(1, wrap.clientWidth / sheet.offsetWidth);
  sheet.style.transform = 'scale(' + scale + ')';
  wrap.style.height = (sheet.offsetHeight * scale) + 'px';   // keep the box the right height
}


/* ---------------------------------------------------------------------
   7. SAVING AND LOADING
   The browser remembers your form, labels and logo between visits.
   try/catch = "if saving is blocked, just carry on".
   --------------------------------------------------------------------- */
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ form: form, queue: queue, tracking: addTracking, rangeOnTracking: showRangeOnTracking }));
  } catch (error) { /* ignore */ }
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      Object.assign(form, saved.form || {});
      queue = (saved.queue || []).slice(0, MAX_LABELS);
      // Older saves kept ONE logo for everything. Give it to the labels that
      // were saved without their own logo, so they look the same as before.
      const oldLogo = saved.logo || '';
      queue.forEach(function (item) {
        if (item.logo === undefined) item.logo = oldLogo;
      });
      if (!form.logo && oldLogo) form.logo = oldLogo;
      addTracking = saved.tracking !== false;
      showRangeOnTracking = saved.rangeOnTracking === true;
    }
  } catch (error) { /* ignore */ }
}


/* ---------------------------------------------------------------------
   8. THE FORM
   --------------------------------------------------------------------- */

// Copy the values from "form" INTO the input boxes
function fillFormFields() {
  document.querySelectorAll('[data-field]').forEach(function (input) {
    input.value = form[input.dataset.field];
  });
}

// Runs every time you type in or change ANY field
function onFieldChange(event) {
  const name = event.target.dataset.field;   // e.g. "year"
  form[name] = event.target.value;           // save what was typed

  // Chose a preset -> fill title and colours from PRESETS
  if (name === 'preset' && PRESETS[form.preset]) {
    form.title     = PRESETS[form.preset][0];
    form.bgColor   = PRESETS[form.preset][1];
    form.textColor = PRESETS[form.preset][2];
    fillFormFields();
  }

  // Picked a colour by hand -> the preset becomes "Custom colours"
  if (name === 'bgColor' || name === 'textColor') {
    form.preset = 'custom';
    fillFormFields();
  }

  drawPreview();
}

// Upload your own logo picture. It is stored in "form", so it is copied
// together with the label when you press "Add label to sheet".
// Labels that are already on the sheet keep their own logo and never change.
function onLogoChosen(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    shrinkImage(reader.result, 600, function (smallLogo) {
      form.logo = smallLogo;
      drawPreview();          // only the preview changes, not the sheet
    });
  };
  reader.readAsDataURL(file);
}

// Makes a picture at most "maxWidth" pixels wide, so saving and the PDF stay fast
function shrinkImage(dataUrl, maxWidth, done) {
  const img = new Image();
  img.onload = function () {
    if (!img.width) { done(dataUrl); return; }       // e.g. an SVG without a size: keep it as it is
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    done(canvas.toDataURL('image/png'));
  };
  img.onerror = function () { done(dataUrl); };      // could not shrink: use it as it is
  img.src = dataUrl;
}

// Go back to the default logo (for NEW labels only)
function onResetLogo() {
  form.logo = '';
  getEl('logoInput').value = '';
  drawPreview();
}


/* ---------------------------------------------------------------------
   9. THE BUTTONS
   --------------------------------------------------------------------- */

// "Add label to sheet"
function onAddLabel() {
  if (queue.length >= MAX_LABELS) return;

  queue.push(Object.assign({}, form));   // add a COPY of the current form

  // Optionally raise the volume: 01 -> 02, 009 -> 010
  if (getEl('autoBump').checked) {
    const match = String(form.volume).match(/^(\D*)(\d+)$/);   // letters + digits
    if (match) {
      const prefix = match[1];
      const digits = match[2];
      const next = String(Number(digits) + 1).padStart(digits.length, '0');
      form.volume = prefix + next;
      fillFormFields();
    }
  }

  drawPreview();
  drawSheet();
}

// Tick / untick "Add tracking sheets"
function onTrackingToggle(event) {
  addTracking = event.target.checked;
  drawPreview();
  drawSheet();
}

// Tick / untick "Show the range on the tracking sheets"
function onRangeToggle(event) {
  showRangeOnTracking = event.target.checked;
  drawPreview();
}

// "Clear sheet"
function onClearSheet() {
  queue = [];
  drawSheet();
}

// Click a small ✕ button to remove one label
function onChipClick(event) {
  const button = event.target.closest('[data-index]');
  if (!button) return;
  queue.splice(Number(button.dataset.index), 1);   // remove 1 item at that position
  drawSheet();
}


/* ---------------------------------------------------------------------
   10. DOWNLOAD PDF
   Page 1   = the label sheet (A4 landscape)
   Page 2+  = one tracking sheet per label (A4 portrait), only if ticked

   For every page we do the same three steps:
     1. Build a full-size copy of the page, hidden far off-screen.
     2. Take a "photo" of that copy (html2canvas).
     3. Put the photo on a PDF page (jsPDF).
   We never photograph what you see on screen, because its size and
   position change with your window and scrolling.
   --------------------------------------------------------------------- */

// Steps 1 + 2: build the HTML off-screen and take a photo of it
async function takePhoto(html) {
  const hidden = document.createElement('div');
  hidden.style.cssText = 'position:absolute;left:-10000px;top:0';
  hidden.innerHTML = html;
  document.body.appendChild(hidden);
  try {
    return await html2canvas(hidden.firstChild, {
      scale: 2,                      // 2 = twice as sharp
      backgroundColor: '#ffffff',
      useCORS: true,
      scrollX: 0,
      scrollY: 0
    });
  } finally {
    hidden.remove();                 // always delete the hidden copy
  }
}

async function onDownloadPdf() {
  if (queue.length === 0) return;

  // Both PDF libraries load from the internet. If they did not load, say so.
  if (typeof html2canvas === 'undefined' || !window.jspdf) {
    getEl('status').textContent = 'The PDF library did not load. Check your internet connection and refresh.';
    return;
  }

  const button = getEl('pdfBtn');
  const status = getEl('status');
  const totalPages = 1 + (addTracking ? queue.length : 0);
  button.disabled = true;
  status.textContent = '';

  // Jump to the top of the page so the photo is never shifted by scrolling.
  // (We remember where you were and go back afterwards.)
  const savedScrollX = window.scrollX;
  const savedScrollY = window.scrollY;
  window.scrollTo(0, 0);

  let message = '';   // shown at the end (drawSheet() would erase it if set earlier)

  try {
    await document.fonts.ready;   // wait until the font is loaded

    // PAGE 1: the label sheet. A4 landscape = 297 x 210 mm (the paper is 297 x 209 mm).
    button.textContent = 'Preparing page 1 of ' + totalPages + '…';
    const sheetPhoto = await takePhoto('<div class="paper">' + buildAllCells() + '</div>');
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.addImage(sheetPhoto.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0.5, 297, 209);

    // PAGE 2, 3, 4 ...: one tracking sheet for each label, in the same order.
    // A4 portrait = 210 x 297 mm (the tracking page is 210 x 296 mm).
    if (addTracking) {
      for (let i = 0; i < queue.length; i++) {
        button.textContent = 'Preparing page ' + (i + 2) + ' of ' + totalPages + '…';
        const trackPhoto = await takePhoto(buildTrackingPage(queue[i]));
        pdf.addPage('a4', 'portrait');
        pdf.addImage(trackPhoto.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0.5, 210, 296);
      }
    }

    pdf.save('file-labels-' + form.year + '.pdf');
    message = 'PDF downloaded (' + totalPages + ' page' + (totalPages > 1 ? 's' : '') + ').';
  } catch (error) {
    console.error(error);   // technical details for the browser console (F12)
    message = 'The PDF could not be created. Try again.';
  } finally {
    window.scrollTo(savedScrollX, savedScrollY);     // go back to where you were
    button.textContent = 'Download PDF';
    drawSheet();                                     // restores button states
    if (message) status.textContent = message;
  }
}


/* ---------------------------------------------------------------------
   11. START-UP  (runs once when the page opens)
   --------------------------------------------------------------------- */

// Connect every input box to onFieldChange
document.querySelectorAll('[data-field]').forEach(function (input) {
  input.addEventListener('input', onFieldChange);
});

// Connect the buttons
getEl('logoInput').addEventListener('change', onLogoChosen);
getEl('resetLogoBtn').addEventListener('click', onResetLogo);
getEl('addBtn').addEventListener('click', onAddLabel);
getEl('clearBtn').addEventListener('click', onClearSheet);
getEl('chips').addEventListener('click', onChipClick);
getEl('pdfBtn').addEventListener('click', onDownloadPdf);
getEl('trackCheck').addEventListener('change', onTrackingToggle);
getEl('rangeCheck').addEventListener('change', onRangeToggle);

// Re-shrink the sheet when the window size changes
window.addEventListener('resize', shrinkSheetToFit);

// First draw
loadData();
getEl('trackCheck').checked = addTracking;
getEl('rangeCheck').checked = showRangeOnTracking;
fillFormFields();
drawPreview();
drawSheet();

// Draw again once the font has loaded so the text sizes are exact
if (document.fonts) {
  document.fonts.ready.then(function () {
    drawPreview();
    drawSheet();
  });
}
